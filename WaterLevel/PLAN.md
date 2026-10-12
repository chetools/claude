# WaterLevel — plan

Predict the mass of water (grams) in one transparent cup from a single video frame.
The model is a ViT trained with LeJEPA (SIGReg). Each frame's camera is passed in as a
Plücker ray map. Code is marimo notebooks, run on molab (RTX PRO 6000 Blackwell, 96 GB).

## 1. Facts and constraints

| Item | Value |
|---|---|
| Videos | 6 iPhone 1080p videos at standard fps. Already recorded, cannot change. |
| Labels | 1 mass in grams per video. The 6 values are distinct and run from empty to nearly full. |
| Scene | The cup and the room are the same in every video. Lighting and where the cup sits can change. |
| Camera | Moves very differently from video to video (orbits, up and down). |
| Training | Choice (c): self-supervised LeJEPA, then end-to-end fine-tuning on grams. |
| Compute | molab with a GPU attached: RTX PRO 6000 Blackwell, 96 GB VRAM, 4 CPUs, 32 GB RAM, sessions up to 12 h. |

## 2. Risks, and how the plan handles them

1. **There are only 6 labels.** Each video carries a single gram value. Statistically this means 6
   samples, not thousands of frames. Consequences:
   - Evaluation is **leave-one-video-out (LOVO)**, 6 folds. Never split frames from the same video between train and test.
   - Only the 4 middle videos test *interpolation*. Holding out the empty or the near-full video
     tests *extrapolation*, so those two folds are reported separately and expected to be worse.
   - Recommendation, even though the videos are fixed: **each extra video recorded later is worth
     more than any change to the model.** The pipeline will accept new videos plus a `labels.csv` row with no code changes.
2. **Lighting and cup placement change between videos, so they are perfectly confounded with the label.**
   Whatever makes a video distinctive also predicts its grams. Mitigations:
   - Crop around the cup using the cup mask (see §3), so the model mostly sees the cup and the water.
   - Strong photometric augmentation (colour jitter, gamma, white balance, blur, noise) and randomised backgrounds outside the mask.
   - Put the rays in **the cup's own coordinate frame**, never the room's, so where the cup sits in the room cannot be read from them.
   - Leak audits (§6) must pass before any score is believed.
3. **Camera paths differ per video, so the ray distribution can identify the video.** Audit: a
   classifier that predicts video ID from rays alone. Fallbacks if it succeeds: drop the absolute
   ray moment and keep only the direction plus the elevation relative to the cup, or rebalance training frames by viewpoint.
4. **A transparent cup with refraction confuses depth and pose estimators.** Canonicalization
   therefore relies on the table plane and the cup silhouette, not on the cup's own predicted depth.
5. **iPhone video quirks:** HEVC encoding, rotation metadata, and often HDR (HLG/Dolby Vision) colour.
   The decoder must apply the rotation and tone-map to SDR. Otherwise colours shift per video, which is another leak.

## 3. Camera poses and the cup frame (`pipeline.py`, stage 1)

The method chosen is **VGGT, followed by putting every video in the cup's coordinate frame**.
COLMAP on a couple of videos serves as a sanity check.

Per video:
1. Decode at about 5 fps. Apply rotation, tone-map to SDR, resize to 518 px for VGGT. Keep the full-resolution frames for training.
2. **VGGT** (`facebook/VGGT-1B`), run once on all sampled frames of the video, gives intrinsics K,
   extrinsics [R|t] and depth for every frame, in that video's own arbitrary frame.
3. **Cup mask:** an open-vocabulary detector (OWLv2 / Grounding DINO, prompt "glass cup") on one
   frame, then **SAM 2** propagates the mask through the whole video. A marimo UI shows the masks for a quick check.
4. **Cup frame:**
   - Table plane: RANSAC on VGGT points in a ring around the cup mask, excluding the cup itself. The plane's normal becomes **+z**.
   - Base centre: intersect the camera rays through the bottom edge of the cup silhouette with the table plane, take the median over frames, and make it the **origin**.
   - Scale: cup height (top rim minus base, measured the same way) = 1 unit. If the real cup height in mm is provided, convert to metres.
   - Yaw around z is arbitrary, since the cup is round. Fix it to the direction of the first camera; ray features must not depend on yaw anyway (see §4).
5. Save per-frame K and the camera-to-cup transform as `poses/vXX.npz`. Push them to the HF dataset under `processed/`.
6. Checks:
   - Draw the cup axis and rim circle back onto the frames.
   - 3D Plotly view of all 6 camera paths in the shared cup frame.
   - Reprojection error of the base point across frames.

Alternatives considered: MASt3R-SfM (slower, same need for the cup frame), COLMAP/GLOMAP
(fragile on glass and low texture), π³/MapAnything (to try if VGGT's poses look bad). A marker board
under the cup would have been best, but the videos are already recorded.

## 4. Plücker rays

- For each pixel, take ray direction d (unit length, in the cup frame) and moment m = o × d, where o is the camera centre in the cup frame. That gives a 6-channel map.
- **Yaw invariance:** the cup is rotationally symmetric, so rotate each frame's rays about z so the camera sits at azimuth 0. This removes a nuisance variable and closes one leak.
- Crops, resizes and flips are applied to the image and the ray map together, so the rays always match the pixels.
- Injection into the ViT: average the 6 ray channels over each 16×16 patch, pass through a linear layer (zero-initialised), and add the result to the patch token. This is the main design. Ablations: no rays, and rays shuffled between frames.

## 5. Model and training (`pipeline.py`, stage 3)

- **Backbone:** ViT-S/16, initialised from DINOv3 (or DINOv2) weights. A from-scratch variant is run as an ablation, because from scratch is the "pure" LeJEPA setting.
- **Stage 1, LeJEPA continued pretraining** on cup-centred crops of frames from the 5 training videos per fold. The held-out video is excluded, so the comparison stays clean.
  - Views: 2 global plus several local crops. Global views may come from **different frames of the same video**. This is a multi-view pairing: same water, different camera, and each view has its own rays.
  - Loss: LeJEPA's prediction loss plus SIGReg (the `lejepa` package: Epps-Pulley test, 1024 slices), with one trade-off weight λ.
- **Stage 2, end-to-end fine-tuning** with the following settings:
  - Head: an MLP on the [CLS] token concatenated with mean-pooled patch tokens. It predicts grams standardised to z-scores.
  - Loss: Huber loss on grams, plus SIGReg kept at a small λ as a regulariser (protects against collapse and overfitting with only 5 labels).
  - Learning rates differ by layer depth (layer-wise decay). Use EMA of the weights and heavy augmentation.
- **Video-level prediction:** take the median over a video's frames; report frame-level numbers too.
- **Precision:** bf16 on Blackwell. Batch size can be large (96 GB), but the dataset is tiny, so expect it to be augmentation-bound, not compute-bound.

## 6. Evaluation and leak audits (`pipeline.py` stage 2, `04_eval.py`)

All results are LOVO over 6 folds. MAE in grams is reported per fold, and for the middle 4 folds versus the end 2.

| Baseline / ablation | Purpose |
|---|---|
| Predict the training mean | The floor. Anything not clearly better than this has learned nothing. |
| Frozen DINOv2 + ridge regression | Generic pretrained features, no LeJEPA. |
| Full model with no rays | Do rays help at all? |
| Full model with shuffled rays | Are the rays carrying label information via leakage? |
| From scratch versus DINO init | What LeJEPA contributes on its own. |

Leak audits. These must come out near chance or near the mean predictor.

| Audit | What it detects |
|---|---|
| Predict grams from **background only** (cup masked out) | Lighting or scene leakage |
| Predict **video ID** from rays alone | Camera-path fingerprints |
| Predict grams from **colour histogram** only | Photometric leakage |

Interpretability check: a saliency or attention rollout map should concentrate on the water line and meniscus.

**Definition of success:** in the 4 middle folds, the MAE is well below the mean predictor's (a target of under half). The audits are clean. Rays at least match the no-ray ablation.

## 7. Notebooks (marimo, on molab)

| Notebook | Contents |
|---|---|
| `pipeline.py` | One notebook, four stages, each behind its own button: **0 data** (pull from HF, decode, check rotation and HDR, contact sheets); **1 poses** (VGGT, SAM 2 masks, cup frame, visual checks, push `processed/` to HF; videos already processed are loaded, not recomputed); **2 audits** (the leak audits); **3 training** (LeJEPA pretraining and fine-tuning, LOVO loop; checkpoints go to an HF model repo, since molab sessions end). Stages pull what they need, so they don't have to be run in order. |
| `04_eval.py` | Results tables, plots, saliency maps. |
| `env_check.py` | Diagnostic: which packages molab actually loads (uv venv vs preinstalled), conflicts, downloadable report. |

- Each notebook declares its dependencies inline (PEP 723) so molab installs them.
- PyTorch must be a CUDA 12.8+ build to run on Blackwell. molab's preinstalled torch (cu130) is used.
- The HF token goes in at runtime through a password field or the `HF_TOKEN` environment variable. It is never stored in the notebook.
- Everything is seeded, and the fold definitions are fixed in `labels.csv` order.

## 8. Still needed from the user

1. Upload the videos to HF (`UPLOAD.md`) and send the repo ID.
2. Optional but useful: the cup's inner height and inner diameter in mm, and the capacity in grams when full to the brim.
