import asyncio, pathlib
from playwright.async_api import async_playwright
HERE = pathlib.Path(__file__).parent
SRC = (HERE / "sample-pfd-v4.svg").resolve()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])  # Playwright-installed Chromium
        pg = await b.new_page(viewport={"width": 1680, "height": 1190})
        await pg.goto("file://" + str(SRC)); await pg.wait_for_timeout(300)
        html = await pg.evaluate("document.documentElement.outerHTML")
        (HERE / "render.html").write_text("<!DOCTYPE html><html><body style='margin:0'>" + html + "</body></html>")
        await pg.screenshot(path=str(HERE / "sample-pfd-v4.png"))
        await pg.pdf(path=str(HERE / "sample-pfd-v4.pdf"), width="420mm", height="297mm", print_background=True, page_ranges="1")
        await b.close()
asyncio.run(main())
print("rendered")
