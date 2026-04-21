"""
Monoko — Lingala TTS Space
Model: DigitalUmuganda/lingala_vits_tts (ESPnet2 VITS, 71.6h real Lingala speech)

API endpoint (Gradio 4.x):
  POST /call/synthesise   → { event_id }
  GET  /call/synthesise/{event_id}  → SSE → audio file URL
"""

import os
import numpy as np
import torch
import gradio as gr
from huggingface_hub import hf_hub_download

REPO_ID  = "DigitalUmuganda/lingala_vits_tts"
HF_TOKEN = os.environ.get("HF_TOKEN")  # set in Space Secrets if repo is private

# ── Download model files at startup (cached after first run) ─────────────────
print(f"Downloading model files from {REPO_ID} …")
config_path = hf_hub_download(
    repo_id=REPO_ID,
    filename="config.yaml",
    token=HF_TOKEN,
)
model_path = hf_hub_download(
    repo_id=REPO_ID,
    filename="train.total_count.best.pth",
    token=HF_TOKEN,
)
print("Files ready. Loading ESPnet2 Text2Speech …")

from espnet2.bin.tts_inference import Text2Speech

text2speech = Text2Speech(
    train_config=config_path,
    model_file=model_path,
    device="cpu",
    # speed_control_alpha=1.0,  # uncomment to adjust speaking rate (1.0 = normal)
)

# Sample rate is set in the ESPnet2 config (typically 22050 Hz for VITS)
SAMPLE_RATE = text2speech.fs if hasattr(text2speech, "fs") else 22050
print(f"Model ready — sample rate {SAMPLE_RATE} Hz")


def synthesise(text: str):
    """Generate Lingala speech. Returns (sample_rate, waveform) for gr.Audio."""
    if not text or not text.strip():
        return None
    with torch.no_grad():
        output = text2speech(text.strip())
    wav = output["wav"]                          # torch.Tensor, shape (samples,)
    audio = wav.numpy().astype(np.float32)
    return (SAMPLE_RATE, audio)


demo = gr.Interface(
    fn=synthesise,
    inputs=gr.Textbox(
        label="Texte Lingala",
        placeholder="Mbote na yo …",
        lines=2,
    ),
    outputs=gr.Audio(label="Audio Lingala", type="numpy"),
    title="Monoko — Lingala TTS",
    description=(
        "Synthèse vocale Lingala · DigitalUmuganda/lingala_vits_tts\n"
        "Modèle VITS entraîné sur 71.6h de parole Lingala authentique."
    ),
    api_name="synthesise",   # → /call/synthesise in Gradio 4.x API
    allow_flagging="never",
)

if __name__ == "__main__":
    demo.launch()
