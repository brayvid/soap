# dashboard_app.py
import streamlit as st
import pandas as pd
from sqlalchemy import create_engine, text
import os
import matplotlib.pyplot as plt
import seaborn as sns
from io import BytesIO
import numpy as np

# --- Page Configuration ---
st.set_page_config(
    layout="wide",
    page_title="Weekly Politician Approval Trends (st.secrets)",
    page_icon="📅"
)

# --- Database Connection using st.secrets ---
# DEPLOY_ENV can still be used to switch logic if needed,
# but credentials will now primarily come from st.secrets
# Default to 'DEVELOPMENT' if DEPLOY_ENV is not set
DEPLOY_ENV = os.environ.get('DEPLOY_ENV', 'DEVELOPMENT').upper()

@st.cache_resource
def get_engine():
    db_connection_str = None
    db_config = None
    status_message_area = st.empty() # For user feedback

    try:
        if DEPLOY_ENV == 'PRODUCTION':
            # status_message_area.info("Attempting to connect to PRODUCTION Read-Only Database (via st.secrets)...")
            # Check if prod_db secrets are defined
            if "prod_db" in st.secrets and all(k in st.secrets.prod_db for k in ["username", "password", "host", "database"]):
                db_config = st.secrets.prod_db
                db_port = db_config.get("port", 5432) # Get port or default
                db_connection_str = f'postgresql+psycopg2://{db_config.username}:{db_config.password}@{db_config.host}:{db_port}/{db_config.database}'
            else:
                status_message_area.error("Production database secrets (prod_db section) not fully configured in st.secrets.")
                return None
        else: # Default to local development settings from st.secrets
            # status_message_area.info("Attempting to connect to LOCAL Database (via st.secrets)...")
            if "local_db" in st.secrets and all(k in st.secrets.local_db for k in ["username", "password", "host", "database"]):
                db_config = st.secrets.local_db
                db_port = db_config.get("port", 5432)
                db_connection_str = f'postgresql+psycopg2://{db_config.username}:{db_config.password}@{db_config.host}:{db_port}/{db_config.database}'
            else:
                status_message_area.error("Local database secrets (local_db section) not fully configured in st.secrets.toml.")
                st.caption("Please ensure you have a .streamlit/secrets.toml file with a [local_db] section for local development.")
                return None
        
        if db_connection_str:
            engine = create_engine(db_connection_str)
            with engine.connect() as connection:
                connection.execute(text("SELECT 1")) # Test connection
            # status_message_area.success(f"DB Connection Successful! ({'Prod (Secrets)' if DEPLOY_ENV == 'PRODUCTION' else 'Local (Secrets)'})")
            return engine
        else: # Should not be reached if logic above is correct, but as a safeguard
            status_message_area.error("Database connection string could not be constructed.")
            return None

    except Exception as e:
        status_message_area.error(f"DB Connection Failed: {e}")
        if db_config: # Log sensitive info only if debugging, be careful
            st.caption(f"Using host: {db_config.get('host', 'N/A')}, user: {db_config.get('username', 'N/A')}")
        return None

engine = get_engine()

# --- Data Fetching Functions (Cached) ---
# These functions remain IDENTICAL as they receive the 'engine' object.
# No changes needed here.
@st.cache_data(ttl=600)
def fetch_politicians_list(_engine):
    if not _engine: return pd.DataFrame({'politician_id': [], 'name': []})
    query = text("SELECT politician_id, name FROM politicians ORDER BY name;")
    try:
        with _engine.connect() as connection:
            df = pd.read_sql(query, connection)
        return df
    except Exception as e:
        st.warning(f"Could not fetch politicians list: {e}")
        return pd.DataFrame({'politician_id': [], 'name': []})

@st.cache_data(ttl=300)
def fetch_weekly_approval_trends_for_selected_politicians(_engine, politician_ids_list):
    if not _engine or not politician_ids_list: 
        return pd.DataFrame()
    
    safe_politician_ids = tuple(int(pid) for pid in politician_ids_list)
    if not safe_politician_ids:
        return pd.DataFrame()

    if len(safe_politician_ids) == 1:
        in_clause_sql = f"({safe_politician_ids[0]})"
    else:
        in_clause_sql = str(safe_politician_ids)
        
    query = text(f"""
        SELECT
            p.name AS politician_name, 
            p.politician_id,           
            TO_CHAR(v.created_at, 'IYYY-IW') AS year_week,
            DATE_TRUNC('week', v.created_at)::date AS week_start_date,
            COUNT(v.vote_id) AS total_votes_in_week,
            CASE
                WHEN COUNT(v.vote_id) > 0 
                THEN ROUND((((SUM(w.sentiment_score) / COUNT(v.vote_id)) / 2.0) + 0.5) * 100.0)
                ELSE NULL
            END AS weekly_approval_rating_percent
        FROM 
            votes AS v 
        JOIN 
            words AS w ON v.word_id = w.word_id
        JOIN 
            politicians AS p ON v.politician_id = p.politician_id 
        WHERE 
            v.politician_id IN {in_clause_sql} 
            AND w.sentiment_score IS NOT NULL 
            AND v.created_at IS NOT NULL
        GROUP BY 
            p.politician_id, p.name, year_week, week_start_date 
        ORDER BY 
            p.name ASC, week_start_date ASC;
    """)
    try:
        with _engine.connect() as connection:
            df = pd.read_sql(query, connection) 
        if 'weekly_approval_rating_percent' in df.columns:
            df['weekly_approval_rating_percent'] = pd.to_numeric(df['weekly_approval_rating_percent'], errors='coerce')
        if 'week_start_date' in df.columns:
            df['week_start_date'] = pd.to_datetime(df['week_start_date'], errors='coerce')
        return df
    except Exception as e:
        st.warning(f"Error fetching weekly approval trends for selected politicians: {e}")
        # st.caption(f"Failed Query (DEBUG): {query}") # Uncomment for debugging
        return pd.DataFrame()

# --- Plotting Helper Function (Identical to previous) ---
def plot_multiline_chart_to_image(df, x_col, y_col, group_col, title, xlabel, ylabel, color_palette="viridis"):
    if df.empty or x_col not in df.columns or y_col not in df.columns or group_col not in df.columns or df[y_col].isnull().all():
        return None
    
    unique_groups = df[group_col].nunique()
    fig_height = max(6, min(12, 5 + unique_groups * 0.3)) 
    
    fig, ax = plt.subplots(figsize=(14, fig_height))
    
    if unique_groups <= 10:
        colors = sns.color_palette("tab10", n_colors=unique_groups)
    else:
        colors = sns.color_palette(color_palette, n_colors=unique_groups)

    sns.lineplot(data=df, x=x_col, y=y_col, hue=group_col, marker='o', ax=ax, linewidth=2, palette=colors)
    
    ax.set_title(title, fontsize=16, pad=15, weight='bold')
    ax.set_xlabel(xlabel, fontsize=13)
    ax.set_ylabel(ylabel, fontsize=13)
    plt.xticks(rotation=30, ha='right', fontsize=10)
    plt.yticks(fontsize=10)
    ax.grid(True, linestyle='--', alpha=0.7)
    ax.set_ylim(-5, 105) 

    if unique_groups > 7: 
        ax.legend(title=group_col.replace('_', ' ').title(), bbox_to_anchor=(1.02, 1), loc='upper left', borderaxespad=0., fontsize='small')
        plt.tight_layout(rect=[0, 0, 0.85, 1]) 
    else:
        ax.legend(title=group_col.replace('_', ' ').title(), fontsize='small')
        plt.tight_layout()

    img_buf = BytesIO()
    fig.savefig(img_buf, format="png", bbox_inches='tight', dpi=100)
    img_buf.seek(0)
    plt.close(fig)
    return img_buf

# --- Main Dashboard UI (Mostly identical, uses the 'engine' from st.secrets) ---
st.title("📅 Politician Approval Ratings")
# st.markdown("Approval Rating is calculated as `ROUND((((Average Original Sentiment Score / 2) + 0.5) * 100))`%.")

if not engine:
    st.error("🔴 CRITICAL: Database connection failed. Dashboard cannot operate.")
    st.stop()

st.markdown("---") 
st.subheader("⚙️ Select Politicians for Trend Analysis")
politicians_df_list = fetch_politicians_list(engine)
default_politician_ids_weekly = [1] 

default_politician_names_weekly = []
if not politicians_df_list.empty and default_politician_ids_weekly:
    default_politician_names_weekly = politicians_df_list[
        politicians_df_list['politician_id'].isin(default_politician_ids_weekly)
    ]['name'].tolist()

selected_politician_names = [] 
if not politicians_df_list.empty:
    all_politician_names = sorted(politicians_df_list['name'].unique().tolist())
    options_with_all = ["All Politicians"] + all_politician_names
    default_selection = default_politician_names_weekly if default_politician_names_weekly else ["All Politicians"]

    selected_options = st.multiselect(
        "Select Politicians:",
        options=options_with_all,
        default=default_selection, 
        key="politician_multiselector_mainpage_secrets", # Changed key to ensure reset if needed
        help="Choose one or more politicians. Select 'All Politicians' to see everyone."
    )

    if "All Politicians" in selected_options:
        selected_politician_names = all_politician_names 
    else:
        selected_politician_names = selected_options
else:
    st.warning("Politician list unavailable for selection.")

selected_politician_ids_for_query = []
if selected_politician_names and not politicians_df_list.empty:
    # Create mapping here as politicians_df_list is available
    politician_names_map = pd.Series(politicians_df_list.politician_id.values, index=politicians_df_list.name).to_dict()
    for name in selected_politician_names:
        pid = politician_names_map.get(name)
        if pid is not None:
            selected_politician_ids_for_query.append(int(pid))

st.markdown("---") 

if selected_politician_ids_for_query:
    # ... (Rest of the UI for displaying chart and data table, identical to previous) ...
    if len(selected_politician_names) == 1:
        st.header(f"Weekly Approval Rating Trend for: {selected_politician_names[0]}")
    elif len(selected_politician_names) <= 5 : 
         st.header(f"Weekly Approval Rating Trend Comparison")
         st.markdown(f"**Displaying trends for:** {', '.join(selected_politician_names)}")
    else:
         st.header(f"Weekly Approval Rating Trend Comparison")
         st.markdown(f"**Displaying trends for {len(selected_politician_names)} selected politicians.**")
    
    weekly_df_multiple = fetch_weekly_approval_trends_for_selected_politicians(engine, selected_politician_ids_for_query)
    
    if not weekly_df_multiple.empty and 'weekly_approval_rating_percent' in weekly_df_multiple.columns and weekly_df_multiple['weekly_approval_rating_percent'].notna().any():
        
        weekly_trend_img = plot_multiline_chart_to_image(
            weekly_df_multiple,
            x_col='week_start_date',
            y_col='weekly_approval_rating_percent',
            group_col='politician_name', 
            title=f'', 
            xlabel='Week Start Date',
            ylabel='Approval Rating (%)'
        )
        if weekly_trend_img:
            st.image(weekly_trend_img, use_container_width=True)

        with st.expander("View Data: Weekly Approval Trends for Selected Politician(s)"):
            df_display_weekly = weekly_df_multiple.copy()
            if 'weekly_approval_rating_percent' in df_display_weekly.columns:
                 df_display_weekly['weekly_approval_rating_percent'] = df_display_weekly['weekly_approval_rating_percent'].map(lambda x: f"{x:.0f}%" if pd.notna(x) else "N/A")
            st.dataframe(df_display_weekly, use_container_width=True)
    else:
        st.info(f"No weekly approval rating data with valid scores found for the selected politician(s).")
elif not politicians_df_list.empty: 
    st.info("ℹ️ Select politician(s) above to see their weekly approval rating trends.")
else:
    st.info("Waiting for politician list to load or database connection...")

st.markdown("---")
st.caption(f"Approval Rating = `ROUND((((Avg Original Sentiment / 2) + 0.5) * 100))`%.")