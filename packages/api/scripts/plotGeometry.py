import json
import os
import sys
import matplotlib.pyplot as plt
import numpy as np # For calculating means for centers

# --- Canonical Face Landmark Indices (from MediaPipe documentation & common mappings) ---
# These should ideally match or be consistent with what you'd use for feature extraction.
# You can find visualizations here: https://developers.google.com/mediapipe/solutions/vision/face_landmarker
# And detailed index lists: https://github.com/ManuelTS/augmentedFaceMeshIndices/blob/master/javascript/exampleMeshIndeces.js

# These are examples; you might want to use the exact same lists as in your processing script
# if you had them there for Node.js or earlier Python versions.
MOUTH_OUTER_CONTOUR_INDICES = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
# MOUTH_INNER_CONTOUR_INDICES = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95] # Optional

LEFT_EYE_CONTOUR_INDICES = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
RIGHT_EYE_CONTOUR_INDICES = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]

LEFT_EYEBROW_CONTOUR_INDICES = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46] # Upper part
RIGHT_EYEBROW_CONTOUR_INDICES = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276] # Upper part

NOSE_OUTLINE_INDICES = [ # A combination for a general nose shape
    # Bridge
    168, 6, 197, 195, 5,
    # Tip and wings (simplified outline selection)
    4, 48, 60, # Left wing area
    219, 209, # Right wing area
    102, 114, 115, 131, 134, # Around nostrils
    166, # Lower tip
    #Connecting back up (these might need adjustment for a clean contour)
    5 # Re-add start of bridge for closed loop if needed for a specific nose plot
] 
# A simpler set just for a "nose line" or tip could be [168, 6, 197, 195, 5, 4]
NOSE_BRIDGE_INDICES = [168, 6, 197, 195, 5]
NOSE_TIP_INDEX = 4

FACE_SILHOUETTE_INDICES = [ # This is a good boundary
  10,  338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58,  132, 93,  234, 127, 162, 21,  54,  103, 67,  109
]
CHIN_POINT_INDEX = 152 # A common reference for the chin point

FEATURE_MAP = {
    "left_eye": LEFT_EYE_CONTOUR_INDICES,
    "right_eye": RIGHT_EYE_CONTOUR_INDICES,
    "left_eyebrow": LEFT_EYEBROW_CONTOUR_INDICES,
    "right_eyebrow": RIGHT_EYEBROW_CONTOUR_INDICES,
    "mouth": MOUTH_OUTER_CONTOUR_INDICES,
    "nose_bridge": NOSE_BRIDGE_INDICES, # For a line
    # "nose_outline": NOSE_OUTLINE_INDICES, # For a fuller shape, might need ordered points
    "face_silhouette": FACE_SILHOUETTE_INDICES,
}

# Key points to label with text (similar to old script)
# We'll calculate centers for eye and mouth, use tip for nose, and specific point for chin
POINTS_TO_LABEL = {
    "left_eye_center": LEFT_EYE_CONTOUR_INDICES, # Will calculate center
    "right_eye_center": RIGHT_EYE_CONTOUR_INDICES, # Will calculate center
    "mouth_center": MOUTH_OUTER_CONTOUR_INDICES, # Will calculate center
    "nose_tip": [NOSE_TIP_INDEX], # Single point
    "chin": [CHIN_POINT_INDEX] # Single point
}


def get_points_from_indices(all_landmarks_list, indices):
    """Extracts (x, y) tuples from the main landmark list using specific indices."""
    points = []
    for index in indices:
        if 0 <= index < len(all_landmarks_list):
            landmark = all_landmarks_list[index] # Landmarks are already {id,x,y}
            points.append((landmark['x'], landmark['y']))
        else:
            print(f"Warning: Landmark index {index} out of bounds.", file=sys.stderr)
    return points

def get_center_of_points(points_list):
    """Calculates the average (center) of a list of (x,y) points."""
    if not points_list:
        return None
    x_coords = [p[0] for p in points_list]
    y_coords = [p[1] for p in points_list]
    return (np.mean(x_coords), np.mean(y_coords))


def plot_face_layout(layout_id):
    filename = f"layout-{layout_id}.json"
    # Assuming this script is in 'scripts/' and data in 'public/data/'
    json_path = os.path.join(os.path.dirname(__file__), "..", "public", "data", filename)

    if not os.path.exists(json_path):
        print(f"❌ Error: File not found: {json_path}")
        sys.exit(1)

    with open(json_path, 'r') as f:
        layout = json.load(f)

    all_landmarks_raw = layout.get('all_points', [])
    if not all_landmarks_raw:
        print(f"❌ Error: No 'all_points' found in {json_path}")
        sys.exit(1)

    # The 'all_points' list is already structured with 'id', 'x', 'y'.
    # MediaPipe landmarks are typically 0-indexed, so the list index matches the ID.
    # If IDs were not contiguous or 0-indexed, we'd need to map them:
    # landmark_map = {lm['id']: lm for lm in all_landmarks_raw}

    plt.figure(figsize=(10, 12)) # Adjusted for title and legend
    ax = plt.gca()

    # 1. Plot all landmarks as small dots
    all_x = [p['x'] for p in all_landmarks_raw]
    all_y = [p['y'] for p in all_landmarks_raw]
    ax.plot(all_x, all_y, '.', color='lightgray', markersize=2, label='All Landmarks (478)')

    # 2. Plot feature contours
    for feature_name, indices in FEATURE_MAP.items():
        points = get_points_from_indices(all_landmarks_raw, indices)
        if points:
            xs, ys = zip(*points)
            # For closed loops like eyes, mouth, silhouette, append the first point to close the loop
            if feature_name not in ["nose_bridge", "left_eyebrow", "right_eyebrow"]: # these are open lines
                xs = list(xs) + [xs[0]]
                ys = list(ys) + [ys[0]]
            ax.plot(xs, ys, '-', linewidth=1.5, label=feature_name.replace("_", " ").title())

    # 3. Plot and label key feature centers/points
    for label_name, indices_for_center in POINTS_TO_LABEL.items():
        points_for_calc = get_points_from_indices(all_landmarks_raw, indices_for_center)
        if points_for_calc:
            if "center" in label_name:
                center_x, center_y = get_center_of_points(points_for_calc)
            else: # It's a single key point
                center_x, center_y = points_for_calc[0]
            
            ax.plot(center_x, center_y, 'o', markersize=5, color='red')
            ax.text(center_x + 10, center_y + 10, label_name.replace("_", " ").title(), color='red')


    ax.invert_yaxis()  # Image coordinates typically have y increasing downwards
    ax.axis('equal')
    ax.grid(True, linestyle=':', alpha=0.5)
    
    # Use canvasWidth and canvasHeight for informative limits if desired, though 'equal' often suffices
    # canvas_width = layout.get('canvasWidth', max(all_x) if all_x else 100)
    # canvas_height = layout.get('canvasHeight', max(all_y) if all_y else 100)
    # ax.set_xlim(0, canvas_width)
    # ax.set_ylim(canvas_height, 0) # Inverted y-axis

    ax.set_xlabel("X (relative to face bounding box)")
    ax.set_ylabel("Y (relative to face bounding box)")
    plt.title(f"Facial Geometry: layout-{layout_id}.json\n(Canvas: {layout.get('canvasWidth',0):.0f}x{layout.get('canvasHeight',0):.0f}, Points: {layout.get('num_landmarks',0)})", fontsize=12)
    
    # Adjust legend position
    plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left', borderaxespad=0.)
    plt.tight_layout(rect=[0, 0, 0.85, 1]) # Adjust layout to make space for legend outside

    plt.show()

# --- Command line usage ---
if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/plotGeometry.py <layout_id_integer>")
        sys.exit(1)
    
    try:
        layout_id_arg = int(sys.argv[1])
        if layout_id_arg < 0: # Allow 0 if that's a valid ID for you
             raise ValueError("Layout ID must be a non-negative integer.")
    except ValueError:
        print("Error: Layout ID must be an integer.")
        print("Usage: python scripts/plotGeometry.py <layout_id_integer>")
        sys.exit(1)

    plot_face_layout(layout_id_arg)