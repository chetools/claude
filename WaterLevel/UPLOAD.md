# Uploading the videos to Hugging Face

## 1. Get the original files off the iPhone
Use the **unmodified originals**. Re-encoded copies lose the rotation and colour metadata the pipeline relies on.
- Photos app on the iPhone: Share → Options → turn on **All Photos Data**. Then send by AirDrop, or save to Files.
- Or: iCloud Photos on the web → select → Download → **Unmodified Original**.
- Or: plug in by USB → Windows Photos / Explorer → DCIM. The files are usually named `IMG_xxxx.MOV`.

## 2. Arrange the folder
```
waterlevel-data/
  videos/
    v01.mov
    v02.mov
    ...
    v07.mov
  labels.csv
```
`labels.csv`:
```
video,grams
v01.mov,0
v02.mov,85
...
```
Optional: a `cup.json` file such as `{"inner_height_mm": 95, "inner_diameter_mm": 72, "brim_grams": 330}`.

## 3. Create a token
At huggingface.co → Settings → Access Tokens, create a **Write** token for uploading.
Create a second **Read** token to use on molab later.

## 4. Upload (PowerShell, run from the folder that contains `waterlevel-data`)
Log in. This prompts for the token; paste the Write token.
```bash
uvx --from huggingface_hub hf auth login
```
Create a private dataset repo:
```bash
uvx --from huggingface_hub hf repos create waterlevel-videos --repo-type dataset --private
```
Upload the folder:
```bash
uvx --from huggingface_hub hf upload carlosco/waterlevel-videos ./waterlevel-data . --repo-type dataset
```
If your HF username is not `carlosco`, change it in the upload command.

## 5. Check
Open https://huggingface.co/datasets/carlosco/waterlevel-videos. You should see 7 videos and `labels.csv`, and the repo should be marked **Private**.
Then send Claude the repo ID. Claude can see the repo through the Hugging Face connector, which is logged in as you.

## 6. Adding videos later
Put the new videos in `videos/`, add rows to `labels.csv`, and run the same `hf upload` command again. Only changed files are uploaded.
