"""Download the Kokoro voice model (Apache-2.0) and make the timed copy that also outputs durations."""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
M = ROOT / "models"
BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"


def main():
    M.mkdir(exist_ok=True)
    timed = M / "kokoro-v1.0-timed.onnx"
    voices = M / "voices-v1.0.bin"
    if not voices.exists():
        print("downloading voices…")
        urllib.request.urlretrieve(BASE + "voices-v1.0.bin", voices)
    if timed.exists():
        print("timed model present")
        return
    raw = M / "kokoro-v1.0.onnx"
    if not raw.exists():
        print("downloading model…")
        urllib.request.urlretrieve(BASE + "kokoro-v1.0.onnx", raw)
    import onnx
    from onnx import TensorProto, helper
    m = onnx.load(str(raw))
    names = {o for n in m.graph.node for o in n.output}
    src = "/encoder/Clip_output_0"
    if src not in names:
        sys.exit("unexpected model graph: duration tensor not found")
    m.graph.node.append(helper.make_node("Identity", [src], ["duration"], name="expose_duration"))
    m.graph.output.append(helper.make_tensor_value_info("duration", TensorProto.FLOAT, None))
    onnx.save(m, str(timed))
    raw.unlink()
    print("timed model ready")


if __name__ == "__main__":
    main()
