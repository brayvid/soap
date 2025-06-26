import cv2
import mediapipe as mp
import json
import argparse
import os
import sys # Make sure sys is imported

# Initialize MediaPipe FaceMesh
mp_face_mesh = mp.solutions.face_mesh

# Define where the portraits are relative to this script's location
# If this script is in project_root/scripts/ and portraits in project_root/portraits/
PORTRAITS_DIR = os.path.join(os.path.dirname(__file__), '..', 'portraits')

def get_face_landmarks(politician_id_str):
    image_filename = f"portrait-{politician_id_str}.jpg"
    image_path = os.path.join(PORTRAITS_DIR, image_filename)

    if not os.path.exists(image_path):
        # Print errors to stderr so they don't mix with JSON on stdout
        print(f"Python Error: Image not found at {image_path} for ID {politician_id_str}", file=sys.stderr)
        return None

    try:
        image = cv2.imread(image_path)
        if image is None:
            print(f"Python Error: Could not read image from {image_path}. Is it a valid image file?", file=sys.stderr)
            return None
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        image_height, image_width, _ = image_rgb.shape
    except Exception as e:
        print(f"Python Error: Error loading or processing image {image_path}: {e}", file=sys.stderr)
        return None

    with mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True, 
            min_detection_confidence=0.5) as face_mesh:

        results = face_mesh.process(image_rgb)

        if not results.multi_face_landmarks:
            print(f"Python Info: No face detected in {image_path}", file=sys.stderr)
            return None

        face_landmarks = results.multi_face_landmarks[0]
        
        all_x_coords = [landmark.x * image_width for landmark in face_landmarks.landmark]
        all_y_coords = [landmark.y * image_height for landmark in face_landmarks.landmark]
        
        min_x, max_x = min(all_x_coords), max(all_x_coords)
        min_y, max_y = min(all_y_coords), max(all_y_coords)

        origin_x, origin_y = min_x, min_y
        face_box_width = max_x - min_x
        face_box_height = max_y - min_y

        processed_landmarks = []
        for i, landmark in enumerate(face_landmarks.landmark):
            processed_landmarks.append({
                "id": i,
                "x": (landmark.x * image_width) - origin_x,
                "y": (landmark.y * image_height) - origin_y,
            })
        
        layout_data = {
            "canvasWidth": face_box_width,
            "canvasHeight": face_box_height,
            "num_landmarks": len(processed_landmarks),
            "all_points": processed_landmarks,
        }
        return layout_data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Detect facial landmarks from an image based on politician ID.")
    parser.add_argument("politician_id", help="The ID of the politician (integer).")
    # This argument is optional and only used if you run the Python script directly
    # Node.js will NOT pass this argument.
    parser.add_argument("--output_file", help="Optional path to save JSON output if run directly (e.g., public/data/layout-1.json).") 
    
    args = parser.parse_args()

    # Suppress TensorFlow/MediaPipe INFO/WARNING logs from C++ to stderr
    # This is a bit aggressive but can help clean up stderr for programmatic use.
    # Set this environment variable BEFORE the first MediaPipe call if possible,
    # or accept that some initial logs might appear.
    # For more granular control, Python's `logging` module can be used to filter.
    os.environ['GLOG_minloglevel'] = '2' # 0=INFO, 1=WARNING, 2=ERROR, 3=FATAL
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2' # 0=INFO, 1=WARNING, 2=ERROR

    landmark_data = get_face_landmarks(args.politician_id)

    if landmark_data:
        json_output = json.dumps(landmark_data, indent=2)
        
        # ALWAYS print PURE JSON to stdout for Node.js (or other callers)
        print(json_output) 
        
        # If --output_file was specified (meaning it's likely a direct run for testing/saving)
        if args.output_file:
            try:
                # Ensure the directory for the output file exists
                output_dir_for_file_save = os.path.dirname(args.output_file)
                if output_dir_for_file_save: # Check if dirname is not empty (e.g. for files in current dir)
                    os.makedirs(output_dir_for_file_save, exist_ok=True)
                
                with open(args.output_file, 'w') as f:
                    f.write(json_output)
                # This confirmation is for when you run Python directly.
                # It goes to stderr so it doesn't pollute stdout for Node.js.
                print(f"Python Info: Landmark data also saved to {args.output_file}", file=sys.stderr)
            except Exception as e:
                print(f"Python Error: Error saving JSON to {args.output_file}: {e}", file=sys.stderr)
    else:
        # If no landmark data, print an error to stderr and exit with non-zero status
        print(f"Python Error: Failed to generate landmark data for ID {args.politician_id}.", file=sys.stderr)
        sys.exit(1) # Python exits with 1 if no landmark_data