import cv2
import mediapipe as mp
import json
import argparse
import os
import sys
import numpy as np

# --- Configuration ---
# This script is assumed to be in a directory like 'project_root/scripts/'
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Define input and output directories relative to the base directory
ORIGINALS_DIR = os.path.join(BASE_DIR, 'originals')
PORTRAITS_DIR = os.path.join(BASE_DIR, 'portraits')
DATA_DIR = os.path.join(BASE_DIR, 'data')

# The face should take up this proportion of the frame before final resizing.
TARGET_FACE_SCALE = 0.70

# --- NEW: Define the final, fixed size for the output portrait ---
FINAL_PORTRAIT_SIZE = 1024

# Initialize MediaPipe FaceMesh
mp_face_mesh = mp.solutions.face_mesh

def process_politician_image(politician_id_str):
    """
    Loads an original image, detects face landmarks, crops the image to a centered
    square portrait, resizes it to a fixed dimension, saves the portrait, and returns
    landmark data scaled to the final image size.
    """
    # --- 1. Define Paths and Ensure Directories Exist ---
    original_image_filename = f"original-{politician_id_str}.jpg"
    original_image_path = os.path.join(ORIGINALS_DIR, original_image_filename)

    output_portrait_filename = f"portrait-{politician_id_str}.jpg"
    output_portrait_path = os.path.join(PORTRAITS_DIR, output_portrait_filename)

    os.makedirs(PORTRAITS_DIR, exist_ok=True)

    # --- 2. Load and Validate the Original Image ---
    if not os.path.exists(original_image_path):
        print(f"Python Error: Image not found at {original_image_path}", file=sys.stderr)
        return None

    try:
        image = cv2.imread(original_image_path)
        if image is None:
            print(f"Python Error: Could not read image from {original_image_path}", file=sys.stderr)
            return None
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        image_height, image_width, _ = image_rgb.shape
    except Exception as e:
        print(f"Python Error: Error loading image {original_image_path}: {e}", file=sys.stderr)
        return None

    # --- 3. Process with MediaPipe FaceMesh ---
    with mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5) as face_mesh:

        results = face_mesh.process(image_rgb)

        if not results.multi_face_landmarks:
            print(f"Python Info: No face detected in {original_image_path}", file=sys.stderr)
            return None

        # --- 4. Calculate Face Bounding Box in Original Image ---
        face_landmarks = results.multi_face_landmarks[0]
        all_x_coords = [landmark.x * image_width for landmark in face_landmarks.landmark]
        all_y_coords = [landmark.y * image_height for landmark in face_landmarks.landmark]

        min_x, max_x = min(all_x_coords), max(all_x_coords)
        min_y, max_y = min(all_y_coords), max(all_y_coords)

        face_width = max_x - min_x
        face_height = max_y - min_y
        face_center_x = min_x + face_width / 2
        face_center_y = min_y + face_height / 2

        # --- 5. Calculate the Square Crop Dimensions ---
        face_max_dim = max(face_width, face_height)
        crop_size = int(face_max_dim / TARGET_FACE_SCALE)
        
        max_safe_size_x = 2 * min(face_center_x, image_width - face_center_x)
        max_safe_size_y = 2 * min(face_center_y, image_height - face_center_y)
        crop_size = int(min(crop_size, max_safe_size_x, max_safe_size_y))

        crop_x1 = int(face_center_x - crop_size / 2)
        crop_y1 = int(face_center_y - crop_size / 2)
        crop_x2 = crop_x1 + crop_size
        crop_y2 = crop_y1 + crop_size

        # --- 6. Crop the Image, Resize it, and Save ---
        initial_cropped_image = image[crop_y1:crop_y2, crop_x1:crop_x2]
        
        # Resize the initially cropped square to the final desired dimensions.
        # cv2.INTER_AREA is a good choice for downsampling (shrinking).
        final_portrait = cv2.resize(initial_cropped_image, (FINAL_PORTRAIT_SIZE, FINAL_PORTRAIT_SIZE), interpolation=cv2.INTER_AREA)

        # --- MODIFICATION START ---
        # Convert the final portrait to grayscale
        final_portrait_grayscale = cv2.cvtColor(final_portrait, cv2.COLOR_BGR2GRAY)
        # --- MODIFICATION END ---
        
        try:
            # Save the resized final GRAYSCALE portrait
            cv2.imwrite(output_portrait_path, final_portrait_grayscale)
            print(f"Python Info: Cropped and resized portrait saved to {output_portrait_path}", file=sys.stderr)
        except Exception as e:
            print(f"Python Error: Could not save final portrait to {output_portrait_path}: {e}", file=sys.stderr)
            return None
        
        # --- 7. Generate Landmark Data Scaled to the FINAL Cropped Image ---
        
        # Get the size of the crop *before* it was resized. This is crucial for calculating the scale factor.
        initial_crop_h, initial_crop_w, _ = initial_cropped_image.shape
        if initial_crop_w == 0:
             print(f"Python Error: Initial crop resulted in a zero-width image for ID {politician_id_str}", file=sys.stderr)
             return None

        # Calculate the ratio to scale the landmark coordinates.
        scale_factor = FINAL_PORTRAIT_SIZE / initial_crop_w

        processed_landmarks = []
        for i, landmark in enumerate(face_landmarks.landmark):
            # Get absolute coords in original image
            abs_x = landmark.x * image_width
            abs_y = landmark.y * image_height
            
            # Convert to coords relative to the *initial* crop box, then scale them up to the final 1024px canvas.
            processed_landmarks.append({
                "id": i,
                "x": (abs_x - crop_x1) * scale_factor,
                "y": (abs_y - crop_y1) * scale_factor,
            })
        
        # The new canvas dimensions are now fixed.
        layout_data = {
            "canvasWidth": FINAL_PORTRAIT_SIZE,
            "canvasHeight": FINAL_PORTRAIT_SIZE,
            "num_landmarks": len(processed_landmarks),
            "all_points": processed_landmarks,
        }
        return layout_data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Crop a politician's portrait to 1024x1024 and extract facial landmarks.")
    parser.add_argument("politician_id", help="The ID of the politician (integer).")
    
    args = parser.parse_args()

    # Suppress TensorFlow/MediaPipe logs
    os.environ['GLOG_minloglevel'] = '2'
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

    landmark_data = process_politician_image(args.politician_id)

    if landmark_data:
        json_output = json.dumps(landmark_data, indent=2)
        
        print(json_output) 
        
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            output_json_filename = f"layout-{args.politician_id}.json"
            output_json_path = os.path.join(DATA_DIR, output_json_filename)

            with open(output_json_path, 'w') as f:
                f.write(json_output)
            print(f"Python Info: Landmark data also saved to {output_json_path}", file=sys.stderr)
        except Exception as e:
            print(f"Python Error: Failed to save JSON to {output_json_path}: {e}", file=sys.stderr)
    else:
        print(f"Python Error: Failed to process image for ID {args.politician_id}.", file=sys.stderr)
        sys.exit(1)