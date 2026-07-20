"""Normalize generated Bloom poses onto one stable 4x2 overlay sprite grid."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CELL_WIDTH = 512
CELL_HEIGHT = 512
TARGET_CENTER_X = CELL_WIDTH // 2
TARGET_BASELINE_Y = 470
TARGET_NEUTRAL_HEIGHT = 380
FILENAMES = {
    "idle": "bloom-idle-sprite.png",
    "wave": "bloom-wave-v2-sprite.png",
    "eat": "bloom-eat-sprite.png",
    "sleep": "bloom-sleep-sprite.png",
    "celebrate": "bloom-celebrate-sprite.png",
}


def runs(values: np.ndarray, minimum_length: int) -> list[tuple[int, int]]:
    result: list[tuple[int, int]] = []
    start: int | None = None
    for index, active in enumerate(values.tolist() + [False]):
        if active and start is None:
            start = index
        elif not active and start is not None:
            if index - start >= minimum_length:
                result.append((start, index))
            start = None
    return result


def extract_frames(source: Image.Image) -> list[Image.Image]:
    alpha = np.asarray(source.getchannel("A")) > 8
    row_bands = runs(alpha.sum(axis=1) > 20, 80)
    if len(row_bands) != 2:
        raise ValueError(f"Expected two populated sprite rows, found {row_bands}")

    frames: list[Image.Image] = []
    for top, bottom in row_bands:
        column_projection = alpha[top:bottom, :].sum(axis=0)
        column_bands = runs(column_projection > 5, 35)
        if len(column_bands) != 4:
            source_cell_width = source.width // 4
            boundaries = [0]
            for expected in (source_cell_width, source_cell_width * 2, source_cell_width * 3):
                search_start = expected - 100
                search_end = expected + 100
                valley = search_start + int(np.argmin(column_projection[search_start:search_end]))
                boundaries.append(valley)
            boundaries.append(source.width)
            column_bands = []
            for left, right in zip(boundaries, boundaries[1:]):
                local_active = np.flatnonzero(column_projection[left:right] > 5)
                if local_active.size == 0:
                    raise ValueError(f"No pose found between columns {left} and {right}")
                column_bands.append((left + int(local_active[0]), left + int(local_active[-1]) + 1))
        for left, right in column_bands:
            frame = source.crop((left, top, right, bottom))
            bbox = frame.getchannel("A").getbbox()
            if bbox is None:
                raise ValueError("Bloom frame is empty")
            frames.append(remove_detached_slivers(frame.crop(bbox)))
    return frames


def remove_detached_slivers(frame: Image.Image) -> Image.Image:
    cleaned = frame
    for _ in range(2):
        mask = np.asarray(cleaned.getchannel("A")) > 8
        x_runs = runs(mask.any(axis=0), 1)
        if len(x_runs) > 1:
            left, right = max(x_runs, key=lambda item: item[1] - item[0])
            cleaned = cleaned.crop((left, 0, right, cleaned.height))
        mask = np.asarray(cleaned.getchannel("A")) > 8
        y_runs = runs(mask.any(axis=1), 1)
        if len(y_runs) > 1:
            top, bottom = max(y_runs, key=lambda item: item[1] - item[0])
            cleaned = cleaned.crop((0, top, cleaned.width, bottom))
    pixels = np.array(cleaned)
    mask = pixels[:, :, 3] > 8
    visited = np.zeros(mask.shape, dtype=bool)
    components: list[list[tuple[int, int]]] = []
    height, width = mask.shape
    for start_y in range(height):
        for start_x in range(width):
            if not mask[start_y, start_x] or visited[start_y, start_x]:
                continue
            queue = deque([(start_x, start_y)])
            visited[start_y, start_x] = True
            component: list[tuple[int, int]] = []
            while queue:
                x, y = queue.popleft()
                component.append((x, y))
                for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= next_x < width and 0 <= next_y < height and mask[next_y, next_x] and not visited[next_y, next_x]:
                        visited[next_y, next_x] = True
                        queue.append((next_x, next_y))
            components.append(component)
    if components:
        minimum_area = len(max(components, key=len)) * 0.02
        keep = np.zeros(mask.shape, dtype=bool)
        for component in components:
            if len(component) >= minimum_area:
                for x, y in component:
                    keep[y, x] = True
        pixels[~keep] = 0
        cleaned = Image.fromarray(pixels, 'RGBA')
        bbox = cleaned.getchannel('A').getbbox()
        if bbox is not None:
            cleaned = cleaned.crop(bbox)
    return cleaned


def belly_anchor(frame: Image.Image) -> float | None:
    pixels = frame.load()
    weighted_x = 0
    count = 0
    top = round(frame.height * 0.40)
    bottom = round(frame.height * 0.88)
    for y in range(top, bottom):
        for x in range(frame.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 180 and red > 215 and green > 165 and 105 < blue < 225:
                weighted_x += x
                count += 1
    return None if count == 0 else weighted_x / count


def face_width(frame: Image.Image) -> int:
    pixels = np.asarray(frame)
    cream = (
        (pixels[:, :, 3] > 180)
        & (pixels[:, :, 0] > 220)
        & (pixels[:, :, 1] > 180)
        & (pixels[:, :, 2] > 125)
    )
    components: list[tuple[int, int, int]] = []
    height, width = cream.shape
    for start_y in range(height):
        for start_x in range(width):
            if not cream[start_y, start_x]:
                continue
            queue = deque([(start_x, start_y)])
            cream[start_y, start_x] = False
            area = 0
            minimum_x = maximum_x = start_x
            while queue:
                x, y = queue.popleft()
                area += 1
                minimum_x = min(minimum_x, x)
                maximum_x = max(maximum_x, x)
                for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= next_x < width and 0 <= next_y < height and cream[next_y, next_x]:
                        cream[next_y, next_x] = False
                        queue.append((next_x, next_y))
            if area > 200:
                components.append((area, maximum_x - minimum_x + 1, minimum_x))
    if not components:
        raise ValueError("Bloom face has no measurable width")
    return max(components, key=lambda component: component[1])[1]


def normalize_sheet(name: str, source_path: Path, output_path: Path) -> None:
    source = Image.open(source_path).convert("RGBA")
    frames = extract_frames(source)
    base_scale = TARGET_NEUTRAL_HEIGHT / frames[0].height
    neutral_face_width = face_width(frames[0])
    output = Image.new("RGBA", (CELL_WIDTH * 4, CELL_HEIGHT * 2), (0, 0, 0, 0))

    frame_scales: list[float] = []

    for index, frame in enumerate(frames):
        scale = base_scale * neutral_face_width / face_width(frame)
        frame_scales.append(scale)
        resized = frame.resize((round(frame.width * scale), round(frame.height * scale)), Image.Resampling.LANCZOS)
        anchor = belly_anchor(frame)
        if anchor is None or (name == "sleep" and index >= 4):
            anchor_after_scale = resized.width / 2
        else:
            anchor_after_scale = anchor * scale
        left = round(TARGET_CENTER_X - anchor_after_scale)

        if name == "celebrate" and index in (3, 4, 5):
            # Preserve a visible jump without pushing the raised arms or head
            # outside the frame. Overflow here bleeds into the row above.
            bottom = {3: 405, 4: 415, 5: 430}[index]
        else:
            bottom = TARGET_BASELINE_Y
        top = round(bottom - resized.height)
        if (
            left < 0
            or top < 0
            or left + resized.width > CELL_WIDTH
            or top + resized.height > CELL_HEIGHT
        ):
            raise ValueError(
                f"{name} frame {index + 1} escapes its sprite cell: "
                f"left={left}, top={top}, width={resized.width}, height={resized.height}"
            )
        column = index % 4
        row = index // 4
        output.alpha_composite(resized, (column * CELL_WIDTH + left, row * CELL_HEIGHT + top))

    temporary = output_path.with_suffix(".normalized.png")
    output.save(temporary, optimize=True)
    temporary.replace(output_path)
    print(f"Normalized {output_path.name}; frame scales {min(frame_scales):.4f}..{max(frame_scales):.4f}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, default=ROOT / "overlays/browser")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "overlays/browser")
    arguments = parser.parse_args()
    for sheet_name, filename in FILENAMES.items():
        normalize_sheet(sheet_name, arguments.source_dir / filename, arguments.output_dir / filename)


if __name__ == "__main__":
    main()
