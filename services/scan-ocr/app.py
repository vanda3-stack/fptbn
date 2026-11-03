"""Private local VietOCR worker. Transcription only; never returns approved marks.
Run: uvicorn app:app --host 127.0.0.1 --port 8010 --workers 1
"""
import asyncio
import base64
import binascii
import hmac
import io
import os
import re
from contextlib import asynccontextmanager

import cv2
import numpy as np
from PIL import Image, ImageOps
from fastapi import FastAPI, Header, HTTPException, Request

Image.MAX_IMAGE_PIXELS = 25_000_000
MODEL = None
LOAD_ERROR = ""
TOKEN = os.environ.get("SCAN_OCR_TOKEN", "")
LOCK = asyncio.Lock()


def load_model():
    global MODEL, LOAD_ERROR
    try:
        from vietocr.tool.config import Cfg
        from vietocr.tool.predictor import Predictor
        cfg = Cfg.load_config_from_name(os.environ.get("SCAN_OCR_MODEL", "vgg_seq2seq"))
        cfg["device"] = os.environ.get("SCAN_OCR_DEVICE", "cpu")
        if os.environ.get("SCAN_OCR_WEIGHTS"):
            cfg["weights"] = os.environ["SCAN_OCR_WEIGHTS"]
        cfg["predictor"]["beamsearch"] = False
        MODEL = Predictor(cfg)
    except Exception as exc:
        # Health reports a useful state without printing model paths or credentials.
        LOAD_ERROR = "Không nạp được VietOCR: " + type(exc).__name__ + ". Kiểm tra weights và thư viện."


@asynccontextmanager
async def lifespan(app):
    if not TOKEN or len(TOKEN) < 24:
        raise RuntimeError("Set SCAN_OCR_TOKEN to a random secret of at least 24 characters")
    await asyncio.to_thread(load_model)
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def authorize(value):
    if not TOKEN or not hmac.compare_digest(value or "", "Bearer " + TOKEN):
        raise HTTPException(401, "Unauthorized")


@app.get("/health")
def health(authorization: str = Header(default="")):
    authorize(authorization)
    return {"ready": MODEL is not None, "engine": "VietOCR", "message": LOAD_ERROR}


def read_page(value):
    if not isinstance(value, str) or len(value) > 17_000_000:
        raise ValueError("Image too large")
    raw = base64.b64decode(value, validate=True)
    with Image.open(io.BytesIO(raw)) as image:
        if image.width * image.height > 25_000_000 or image.width < 100 or image.height < 100:
            raise ValueError("Image dimensions out of range")
        return ImageOps.exif_transpose(image).convert("RGB")


def line_crops(image):
    """Conservative horizontal projection; original pixels go to the model.
    Ruled paper, slanted lines and touching handwriting still require human review.
    """
    grey = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2GRAY)
    binary = cv2.threshold(grey, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    # Remove long printed rules from segmentation mask only, never OCR input.
    width = binary.shape[1]
    rules = cv2.morphologyEx(binary, cv2.MORPH_OPEN, np.ones((1, max(40, int(width * .6))), np.uint8))
    mask = cv2.subtract(binary, rules)
    projection = np.count_nonzero(mask, axis=1)
    occupied = projection > max(2, width * .006)
    spans, start = [], None
    for y, yes in enumerate(occupied):
        if yes and start is None:
            start = y
        if not yes and start is not None:
            spans.append([start, y])
            start = None
    if start is not None:
        spans.append([start, len(occupied)])
    if not spans:
        return []
    merged = []
    # Merge nearby tone-mark strokes, preserving a small margin around each line.
    for a, b in spans:
        if merged and a - merged[-1][1] <= max(3, int(image.height * .004)):
            merged[-1][1] = b
        else:
            merged.append([a, b])
    return [image.crop((0, max(0,a-5), image.width, min(image.height,b+5))) for a,b in merged if b-a >= 3][:100]


def transcribe(payload):
    pages = payload.get("pages")
    layout = payload.get("layout")
    if not isinstance(pages, list) or len(pages) != 2 or not isinstance(layout, dict) or len(layout) > 23:
        raise ValueError("Expected two pages and at most 23 regions")
    images = [read_page(p) for p in pages]
    fields = {}
    for key, box in layout.items():
        if not re.fullmatch(r"code|q(?:[1-9]|1[0-9]|20)|essay[12]", key):
            raise ValueError("Unknown region")
        if box.get("page") not in (0, 1):
            raise ValueError("Invalid page")
        image = images[box["page"]]
        x,y,w,h = [float(box[k]) for k in ("x","y","w","h")]
        if not (0 <= x < 1 and 0 <= y < 1 and .002 <= w <= 1 and .002 <= h <= 1 and x+w <= 1.001 and y+h <= 1.001):
            raise ValueError("Invalid region")
        crop = image.crop((round(x*image.width), round(y*image.height), min(image.width,round((x+w)*image.width)), min(image.height,round((y+h)*image.height))))
        crops = line_crops(crop) if key.startswith("essay") else [crop]
        lines, scores = [], []
        for line in crops:
            text, probability = MODEL.predict(line, return_prob=True)
            lines.append(text)
            scores.append(float(probability))
        fields[key] = {"text": "\n".join(lines), "modelScore": min(scores) if scores else None,
                       "requiresReview": True}
    return {"engine": "VietOCR/" + os.environ.get("SCAN_OCR_MODEL", "vgg_seq2seq"), "fields": fields}


@app.post("/recognize")
async def recognize(request: Request, authorization: str = Header(default="")):
    authorize(authorization)
    if MODEL is None:
        raise HTTPException(503, LOAD_ERROR or "Model unavailable")
    if LOCK.locked():
        raise HTTPException(429, "One OCR request at a time")
    if int(request.headers.get("content-length", "0")) > 35_000_000:
        raise HTTPException(413, "Request too large")
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 35_000_000:
            raise HTTPException(413, "Request too large")
    import json
    try:
        payload = json.loads(raw)
        async with LOCK:
            return await asyncio.to_thread(transcribe, payload)
    except (ValueError, TypeError, KeyError, binascii.Error, Image.DecompressionBombError):
        raise HTTPException(400, "Invalid image or region")
