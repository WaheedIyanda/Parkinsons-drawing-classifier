"""
NeuroTrace — Parkinson's Diagnostic API
Directly mirrors the working Colab notebook code.

Run:
    python -m uvicorn app:app --reload --host 127.0.0.1 --port 8080

Then open:
    http://localhost:8080        → Frontend
    http://localhost:8080/docs   → Swagger API docs
"""

import io
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms, models
from PIL import Image

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel


# ── APP ──────────────────────────────────────────────────────────

app = FastAPI(title="NeuroTrace — Parkinson's Diagnostic API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")


# ── DEVICE — same as Colab ────────────────────────────────────────

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"\nDevice: {device}")


# ── MODEL — exact copy of your Colab create_model() ──────────────

def create_model():
    model = models.resnet18(weights=None)   # same as pretrained=False
    model.fc = nn.Linear(model.fc.in_features, 2)
    return model.to(device)


# ── LOAD MODELS — exact copy of your Colab load code ─────────────
import os
BASE_DIR          = os.path.dirname(os.path.abspath(__file__))
SPIRAL_MODEL_PATH = os.path.join(BASE_DIR, "spiral_specialist.pth")
WAVE_MODEL_PATH   = os.path.join(BASE_DIR, "wave_specialist_80.pth")

print("Loading models...")

spiral_model = create_model()
spiral_model.load_state_dict(
    torch.load(
        SPIRAL_MODEL_PATH,
        map_location=device
    )
)
spiral_model.eval()
print("  ✓ spiral_specialist loaded")

wave_model = create_model()
wave_model.load_state_dict(
    torch.load(
        WAVE_MODEL_PATH,
        map_location=device
    )
)
wave_model.eval()
print("  ✓ wave_specialist loaded")

print("Models ready!\n")


# ── TRANSFORM — exact copy of your Colab test_transform ──────────

test_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        [0.485, 0.456, 0.406],
        [0.229, 0.224, 0.225]
    )
])


# ── PREDICT — exact copy of your Colab predict_image() ───────────

def predict_image(image_bytes: bytes, model) -> float:
    """Returns Parkinson's probability (0.0 to 1.0) — same as Colab."""
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image = test_transform(image).unsqueeze(0).to(device)

    with torch.no_grad():
        output = model(image)
        prob   = F.softmax(output, dim=1)

    return prob[0][1].item()   # Parkinson probability — same as Colab


# ── RESPONSE SCHEMA ───────────────────────────────────────────────

class AnalysisResult(BaseModel):
    spiral_prob: float   # raw 0–1 (same as Colab spiral_prob)
    wave_prob:   float   # raw 0–1 (same as Colab wave_prob)
    final_prob:  float   # raw 0–1 (same as Colab final_prob)
    model1_prob: float   # percentage for frontend display
    model2_prob: float   # percentage for frontend display
    avg_prob:    float   # percentage for frontend display
    risk_level:  str
    demo_mode:   bool


# ── ROUTES ────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def serve_frontend():
    return FileResponse("static/index.html")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "spiral_model": "loaded",
        "wave_model":   "loaded",
        "device":       str(device),
    }


@app.post("/analyze", response_model=AnalysisResult)
async def analyze(
    spiral:      UploadFile = File(...),
    handwriting: UploadFile = File(...),
):
    try:
        spiral_bytes = await spiral.read()
        wave_bytes   = await handwriting.read()

        # ── exact same logic as your Colab notebook ──
        spiral_prob = predict_image(spiral_bytes, spiral_model)
        wave_prob   = predict_image(wave_bytes,   wave_model)
        final_prob  = (spiral_prob + wave_prob) / 2

        print(f"\nSpiral Parkinson Probability : {spiral_prob*100:.2f}%")
        print(f"Wave Parkinson Probability   : {wave_prob*100:.2f}%")
        print(f"Final Averaged Risk          : {final_prob*100:.2f}%")

        if final_prob > 0.5:
            print("⚠ High Parkinson Risk")
            risk_level = "High Risk"
        else:
            print("✅ Low Parkinson Risk")
            risk_level = "Low Risk" if final_prob < 0.4 else "Moderate Risk"

        return AnalysisResult(
            spiral_prob = round(spiral_prob, 4),
            wave_prob   = round(wave_prob,   4),
            final_prob  = round(final_prob,  4),
            model1_prob = round(spiral_prob * 100, 2),
            model2_prob = round(wave_prob   * 100, 2),
            avg_prob    = round(final_prob  * 100, 1),
            risk_level  = risk_level,
            demo_mode   = False,
        )

    except Exception as e:
        print(f"ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── ENTRY POINT ───────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8080, reload=True)
