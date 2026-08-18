"""Face detection helper for the Reelize `plan` stage.

Usage: python analyze_faces.py <frames-dir>
Reads every *.jpg in <frames-dir>, prints JSON to stdout:
  {"frame.jpg": [{"cx": 0.42, "cy": 0.31, "w": 0.18, "h": 0.24, "score": 0.93}, ...], ...}
Coordinates are normalized to [0,1] relative to the frame; cx/cy is the face center.

Pinned to mediapipe 0.10.x legacy solutions API (CPU): the 1.x tasks API's macOS
face graph initializes Metal unconditionally and aborts in headless contexts.
"""

import json
import os
import sys


def main():
    frames_dir = sys.argv[1]

    import cv2
    import mediapipe as mp

    out = {}
    with mp.solutions.face_detection.FaceDetection(
        model_selection=1,  # full-range model: podcast wide shots
        min_detection_confidence=0.5,
    ) as detector:
        for name in sorted(os.listdir(frames_dir)):
            if not name.endswith(".jpg"):
                continue
            bgr = cv2.imread(os.path.join(frames_dir, name))
            if bgr is None:
                out[name] = []
                continue
            result = detector.process(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            faces = []
            for det in result.detections or []:
                box = det.location_data.relative_bounding_box
                faces.append(
                    {
                        "cx": round(box.xmin + box.width / 2, 4),
                        "cy": round(box.ymin + box.height / 2, 4),
                        "w": round(box.width, 4),
                        "h": round(box.height, 4),
                        "score": round(det.score[0], 3) if det.score else 0.0,
                    }
                )
            out[name] = faces

    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
