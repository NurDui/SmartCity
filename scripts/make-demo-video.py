"""Create a captioned walkthrough from screenshots captured from the running app.

Requires Pillow + imageio-ffmpeg. No fabricated interface frames are generated.
Usage: python scripts/make-demo-video.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
CAPTURES = ROOT / 'tmp' / 'demo'
OUTPUT = ROOT / 'output' / 'video'
STEPS = [
    ('01-home.png', '01 / Выберите свой ритм', 'Стартовая точка, свободное время и интересы. Геолокация не обязательна.'),
    ('02-summer.png', '02 / Летний сценарий', 'Поиск по каталогу: до трёх мест, объяснение, время и план посещения.'),
    ('03-winter.png', '03 / Тёплая прогулка у EXPO', 'Симуляция −25 °C: помещения и короткий подход. Часы уточняются по источнику.'),
    ('04-sources.png', '04 / Проверяйте источники', 'Сведения о месте и сгенерированные идеи помечены. Маршрут уточняется в 2ГИС.'),
    ('05-saved.png', '05 / Сохраните интересное', 'В избранном хранятся только ID мест. История перемещений не записывается.'),
    ('06-how.png', '06 / Прозрачный подход', 'Без ключа — поиск и шаблон. С серверным ключом — генерация LLM по найденным данным.'),
]

def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    font_path = Path('C:/Windows/Fonts/arial.ttf')
    font_bold_path = Path('C:/Windows/Fonts/arialbd.ttf')
    if not font_path.exists():
        font_path = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
        font_bold_path = font_path
    title_font = ImageFont.truetype(str(font_bold_path), 27)
    body_font = ImageFont.truetype(str(font_path), 19)
    small_font = ImageFont.truetype(str(font_path), 16)
    target = OUTPUT / 'qadam-demo.mp4'
    writer = imageio_ffmpeg.write_frames(str(target), (1280, 920), fps=20,
        codec='libx264', pix_fmt_in='rgb24', pix_fmt_out='yuv420p',
        output_params=['-crf', '22', '-movflags', '+faststart'])
    writer.send(None)
    try:
        for filename, title, caption in STEPS:
            source = CAPTURES / filename
            if not source.exists():
                raise FileNotFoundError(f'Capture the real app first: {source}')
            image = Image.open(source).convert('RGB')
            image.thumbnail((1240, 752), Image.Resampling.LANCZOS)
            frame = Image.new('RGB', (1280, 920), '#f7f5ee')
            draw = ImageDraw.Draw(frame)
            draw.text((24, 20), 'qadam', font=title_font, fill='#224d3d')
            draw.text((210, 23), title, font=title_font, fill='#224d3d')
            frame.paste(image, ((1280-image.width)//2, 82))
            draw.rectangle((0, 850, 1280, 920), fill='#224d3d')
            draw.text((24, 863), caption, font=body_font, fill='#ffffff')
            draw.text((24, 895), 'Реальные экраны работающего прототипа · Задача 1 · Демо без API-ключа', font=small_font, fill='#d2decf')
            rgb = frame.tobytes()
            for _ in range(20 * 12):
                writer.send(rgb)
    finally:
        writer.close()
    print(target)

if __name__ == '__main__':
    main()
