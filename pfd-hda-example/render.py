"""Render sheet SVGs to A3 PDF (420 mm x 297 mm) and PNG for inspection.

usage: python render.py out/PFD-201-r1.svg [...] [--crop x,y,w,h:name ...]
Writes <stem>.pdf, <stem>.png (1680 x 1190, final size at 4 px/mm) and
<stem>-x2.png (double resolution) next to each SVG; --crop writes magnified
(x3) regions <stem>-<name>.png for template-group inspection, and --grey
writes <stem>-grey.png (greyscale reproduction, L6).
"""
import pathlib, sys
from playwright.sync_api import sync_playwright


def main(argv):
    svgs = [pathlib.Path(a) for a in argv if a.endswith(".svg")]
    crops = [a for a in argv if ":" in a and "," in a]
    grey = "--grey" in argv
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        for svg in svgs:
            body = svg.read_text()
            page_html = ("<!DOCTYPE html><html><head><meta charset='utf-8'><style>@page{size:420mm 297mm;margin:0}"
                         "html,body{margin:0;padding:0}svg{display:block;width:420mm;height:297mm}</style></head><body>"
                         + body + "</body></html>")
            for scale, suffix in ((1, ""), (2, "-x2")):
                pg = br.new_page(viewport={"width": 1680, "height": 1190}, device_scale_factor=scale)
                pg.set_content(page_html.replace("width:420mm;height:297mm", "width:1680px;height:1190px"))
                pg.screenshot(path=str(svg.with_name(svg.stem + suffix + ".png")))
                if scale == 1 and grey:
                    pg.add_style_tag(content="svg{filter:grayscale(1)}")
                    pg.screenshot(path=str(svg.with_name(svg.stem + "-grey.png")))
                pg.close()
            pg = br.new_page()
            pg.set_content(page_html)
            pg.pdf(path=str(svg.with_name(svg.stem + ".pdf")), width="420mm", height="297mm",
                   print_background=True, page_ranges="1")
            pg.close()
            for c in crops:
                box, name = c.split(":")
                x, y, w, h = (float(v) for v in box.split(","))
                pg = br.new_page(viewport={"width": 1680, "height": 1190}, device_scale_factor=3)
                pg.set_content(page_html.replace("width:420mm;height:297mm", "width:1680px;height:1190px"))
                pg.screenshot(path=str(svg.with_name(f"{svg.stem}-{name}.png")),
                              clip={"x": x, "y": y, "width": w, "height": h})
                pg.close()
            print("rendered", svg)
        br.close()


if __name__ == "__main__":
    main(sys.argv[1:])
