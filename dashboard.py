# dashboard_app.py
# Copyright 2024-2025 soap.fyi <https://soap.fyi>
import streamlit as st
import pandas as pd
from sqlalchemy import create_engine, text
import os
import matplotlib.pyplot as plt
import seaborn as sns
from io import BytesIO
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity 

# --- Page Configuration ---
st.set_page_config(
    layout="wide", 
    page_title="Soap | Polling Dashboard",
    page_icon="🫧" 
)

# --- Database Connection (Same as before) ---
DB_USER_LOCAL = 'local_ds_user'; DB_PASSWORD_LOCAL = 'a_secure_local_password'; DB_HOST_LOCAL = 'localhost'; DB_PORT_LOCAL = '5432'; DB_NAME_LOCAL = 'my_local_copy_db'
DB_USER_PROD = os.environ.get('PROD_DB_USER'); DB_PASSWORD_PROD = os.environ.get('PROD_DB_PASSWORD'); DB_HOST_PROD = os.environ.get('PROD_DB_HOST'); DB_PORT_PROD = os.environ.get('PROD_DB_PORT', '5432'); DB_NAME_PROD = os.environ.get('PROD_DB_NAME')
DEPLOY_ENV = os.environ.get('DEPLOY_ENV', 'DEVELOPMENT').upper()
@st.cache_resource
def get_engine():
    db_connection_str = None; db_config = None
    try:
        if DEPLOY_ENV == 'PRODUCTION':
            if "prod_db" in st.secrets and all(k in st.secrets.prod_db for k in ["username", "password", "host", "database"]):
                db_config = st.secrets.prod_db; db_port = db_config.get("port", 5432)
                db_connection_str = f'postgresql+psycopg2://{db_config.username}:{db_config.password}@{db_config.host}:{db_port}/{db_config.database}'
            else: return None 
        else: 
            if "local_db" in st.secrets and all(k in st.secrets.local_db for k in ["username", "password", "host", "database"]):
                db_config = st.secrets.local_db; db_port = db_config.get("port", 5432)
                db_connection_str = f'postgresql+psycopg2://{db_config.username}:{db_config.password}@{db_config.host}:{db_port}/{db_config.database}'
            else: return None
        if db_connection_str:
            engine = create_engine(db_connection_str)
            with engine.connect() as connection: connection.execute(text("SELECT 1")) 
            return engine
        else: return None
    except Exception as e: return None
engine = get_engine()

# --- Data Fetching Functions ---
@st.cache_data(ttl=600)
def fetch_politicians_list(_engine): # Fetches all politicians, sorted by name
    if not _engine: return pd.DataFrame({'politician_id': [], 'name': []})
    query = text("SELECT politician_id, name FROM politicians ORDER BY name ASC;") # Explicitly sort by name ASC
    try:
        with _engine.connect() as connection: df = pd.read_sql(query, connection)
        return df
    except Exception as e: return pd.DataFrame({'politician_id': [], 'name': []})

@st.cache_data(ttl=600)
def fetch_sentiment_distribution_per_politician(_engine, min_total_votes_threshold=10, sort_by_total_votes=False):
    if not _engine: return pd.DataFrame()
    approve_threshold = 0.1; disapprove_threshold = -0.1
    
    order_by_clause = "ORDER BY approve_percent DESC, ptv.total_votes DESC, p.name ASC"
    if sort_by_total_votes:
        order_by_clause = "ORDER BY ptv.total_votes DESC, approve_percent DESC, p.name ASC"

    query = text(f"""
        WITH VoteSentimentCategories AS (
            SELECT v.politician_id,
                CASE WHEN w.sentiment_score > {approve_threshold} THEN 'Approve'
                     WHEN w.sentiment_score < {disapprove_threshold} THEN 'Disapprove'
                     ELSE 'Neutral' END AS sentiment_category
            FROM votes AS v JOIN words AS w ON v.word_id = w.word_id WHERE w.sentiment_score IS NOT NULL 
        ), PoliticianSentimentCounts AS (
            SELECT politician_id, sentiment_category, COUNT(*) AS category_count
            FROM VoteSentimentCategories GROUP BY politician_id, sentiment_category
        ), PoliticianTotalScorableVotes AS (
            SELECT politician_id, COUNT(*) AS total_votes FROM VoteSentimentCategories GROUP BY politician_id
        )
        SELECT p.politician_id, p.name AS politician_name,
            COALESCE(SUM(CASE WHEN psc.sentiment_category = 'Approve' THEN psc.category_count ELSE 0 END) * 100.0 / NULLIF(ptv.total_votes, 0), 0) AS approve_percent,
            COALESCE(SUM(CASE WHEN psc.sentiment_category = 'Disapprove' THEN psc.category_count ELSE 0 END) * 100.0 / NULLIF(ptv.total_votes, 0), 0) AS disapprove_percent,
            COALESCE(SUM(CASE WHEN psc.sentiment_category = 'Neutral' THEN psc.category_count ELSE 0 END) * 100.0 / NULLIF(ptv.total_votes, 0), 0) AS neutral_percent,
            ptv.total_votes
        FROM politicians AS p JOIN PoliticianTotalScorableVotes AS ptv ON p.politician_id = ptv.politician_id
        LEFT JOIN PoliticianSentimentCounts AS psc ON p.politician_id = psc.politician_id
        WHERE ptv.total_votes >= :min_votes_threshold 
        GROUP BY p.politician_id, p.name, ptv.total_votes
        {order_by_clause}; 
    """)
    try:
        with _engine.connect() as connection:
            df = pd.read_sql(query, connection, params={'min_votes_threshold': min_total_votes_threshold})
        for col in ['approve_percent', 'disapprove_percent', 'neutral_percent', 'total_votes']:
            if col in df.columns: df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
        return df
    except Exception as e: 
        return pd.DataFrame()

@st.cache_data(ttl=300)
def fetch_weekly_approval_trends_for_selected_politicians(_engine, politician_ids_list):
    if not _engine or not politician_ids_list: return pd.DataFrame()
    safe_politician_ids = tuple(int(pid) for pid in politician_ids_list)
    if not safe_politician_ids: return pd.DataFrame()
    if len(safe_politician_ids) == 1: in_clause_sql = f"({safe_politician_ids[0]})"
    else: in_clause_sql = str(safe_politician_ids)
    query = text(f"""
        SELECT p.name AS politician_name, p.politician_id,           
            TO_CHAR(v.created_at, 'IYYY-IW') AS year_week,
            DATE_TRUNC('week', v.created_at)::date AS week_start_date,
            COUNT(v.vote_id) AS total_votes_in_week,
            CASE WHEN COUNT(v.vote_id) > 0 
                THEN (((SUM(w.sentiment_score) / COUNT(v.vote_id)) / 2.0) + 0.5) * 100.0 
                ELSE NULL END AS weekly_approval_rating_percent 
        FROM votes AS v JOIN words AS w ON v.word_id = w.word_id
        JOIN politicians AS p ON v.politician_id = p.politician_id 
        WHERE v.politician_id IN {in_clause_sql} 
            AND w.sentiment_score IS NOT NULL AND v.created_at IS NOT NULL
        GROUP BY p.politician_id, p.name, year_week, week_start_date 
        ORDER BY p.name ASC, week_start_date ASC;
    """)
    try:
        with _engine.connect() as connection: df = pd.read_sql(query, connection) 
        if 'weekly_approval_rating_percent' in df.columns: df['weekly_approval_rating_percent'] = pd.to_numeric(df['weekly_approval_rating_percent'], errors='coerce') 
        if 'week_start_date' in df.columns: df['week_start_date'] = pd.to_datetime(df['week_start_date'], errors='coerce')
        return df
    except Exception as e: return pd.DataFrame()

# --- Plotting Helper Functions ---
def plot_stacked_horizontal_bar_to_image(df, categories, category_colors, title, xlabel, ylabel, top_n=20, decimal_places=1):
    if df.empty or not all(cat in df.columns for cat in categories): return None
    data_to_plot = df.head(top_n).copy();
    for cat in categories: data_to_plot[cat] = pd.to_numeric(data_to_plot[cat], errors='coerce').fillna(0)
    plot_df_ready = data_to_plot.set_index('politician_name')[categories] 
    # Data is assumed to be sorted by SQL (e.g. approve_percent DESC).
    # For barh, to have the first row of the original sorted df at the top, reverse it for plotting.
    plot_df_ready = plot_df_ready.iloc[::-1] 
    num_politicians = len(plot_df_ready)
    fig_height = max(6, min(15, 2 + num_politicians * 0.7)); fig_width = 12
    fig, ax = plt.subplots(figsize=(fig_width, fig_height))
    plot_df_ready.plot(kind='barh', stacked=True, color=category_colors, ax=ax, width=0.8)
    ax.set_title(title, fontsize=16, pad=15, weight='bold')
    ax.set_xlabel(xlabel, fontsize=13); ax.set_ylabel(ylabel, fontsize=13)
    ax.set_xlim(0, 105); ax.legend(title="Sentiment Category", bbox_to_anchor=(1.02, 1), loc='upper left', fontsize='small')
    for p_index, (idx, row) in enumerate(plot_df_ready.iterrows()):
        cumulative_width = 0
        for i, val in enumerate(row):
            if val > 3: 
                 label_x_pos = cumulative_width + (val / 2)
                 ax.text(label_x_pos, p_index, f'{val:.{decimal_places}f}%', 
                         ha='center', va='center', color='white', fontsize=9, weight='bold',
                         bbox=dict(boxstyle="round,pad=0.1", fc='black', alpha=0.3, ec='none'))
            cumulative_width += val
    plt.tight_layout(rect=[0, 0, 0.85, 1]); img_buf = BytesIO()
    fig.savefig(img_buf, format="png", bbox_inches='tight', dpi=100); img_buf.seek(0)
    plt.close(fig); return img_buf

def plot_multiline_chart_to_image(df, x_col, y_col, group_col, title, xlabel, ylabel, color_palette="viridis", decimal_places=0):
    if df.empty or x_col not in df.columns or y_col not in df.columns or group_col not in df.columns or df[y_col].isnull().all(): return None
    unique_groups = df[group_col].nunique(); fig_height = max(6, min(12, 5 + unique_groups * 0.3)); fig_width = 14
    fig, ax = plt.subplots(figsize=(fig_width, fig_height))
    if unique_groups <= 10: colors = sns.color_palette("tab10", n_colors=unique_groups)
    else: colors = sns.color_palette(color_palette, n_colors=unique_groups)
    sns.lineplot(data=df, x=x_col, y=y_col, hue=group_col, marker='o', ax=ax, linewidth=2, palette=colors)
    ax.set_title(title, fontsize=16, pad=15, weight='bold'); ax.set_xlabel(xlabel, fontsize=13); ax.set_ylabel(ylabel, fontsize=13)
    plt.xticks(rotation=30, ha='right', fontsize=10); plt.yticks(fontsize=10)
    ax.grid(True, linestyle='--', alpha=0.7); ax.set_ylim(-5, 105)
    for line_index, politician_name_val in enumerate(df[group_col].unique()):
        politician_df = df[df[group_col] == politician_name_val]
        for index, row in politician_df.iterrows():
            if pd.notna(row[y_col]):
                ax.text(row[x_col], row[y_col] + 2, f"{row[y_col]:.{decimal_places}f}%", 
                        color=colors[line_index % len(colors)], ha="center", va="bottom", fontsize=8, weight='bold',
                        bbox=dict(boxstyle="round,pad=0.1", fc='white', alpha=0.5, ec='none'))
    if unique_groups > 7: 
        ax.legend(title=group_col.replace('_', ' ').title(), bbox_to_anchor=(1.02, 1), loc='upper left', borderaxespad=0., fontsize='small')
        plt.tight_layout(rect=[0, 0, 0.85, 1]) 
    else:
        ax.legend(title=group_col.replace('_', ' ').title(), fontsize='small'); plt.tight_layout()
    img_buf = BytesIO(); fig.savefig(img_buf, format="png", bbox_inches='tight', dpi=100); img_buf.seek(0)
    plt.close(fig); return img_buf

def plot_similarity_heatmap_to_image(similarity_matrix_df, title="Submitted Valence Similarity"): 
    if similarity_matrix_df.empty or len(similarity_matrix_df) < 2: return None # Need at least 2 for heatmap
    
    plot_df = similarity_matrix_df.copy() 
    display_n = len(plot_df) 

    for col in plot_df.columns: plot_df[col] = pd.to_numeric(plot_df[col], errors='coerce')
    
    fig_height = max(8, min(25, 3 + display_n * 0.9)) # Allow taller for more politicians
    fig_width = fig_height * 1.2 
    if display_n < 5 : fig_height = 6; fig_width = 8
    
    fig, ax = plt.subplots(figsize=(fig_width, fig_height))
    sns.heatmap(plot_df, annot=True, fmt=".2f", cmap="viridis", linewidths=.5, ax=ax, 
                cbar=True, square=True, annot_kws={"size": 6 if display_n > 20 else (7 if display_n > 15 else 8)},
                cbar_kws={'label': 'Cosine Similarity of Sentiment Distribution', 'shrink': 0.7}) 
    ax.set_title(title, fontsize=16, pad=20, weight='bold')
    ax.tick_params(axis='x', rotation=70, labelsize=9) # Smaller labels for more items
    ax.tick_params(axis='y', rotation=0, labelsize=8)
    
    fig.subplots_adjust(left=0.3 if display_n > 5 else 0.25, bottom=0.3 if display_n > 5 else 0.25, right=0.98, top=0.95)
    
    img_buf = BytesIO(); 
    fig.savefig(img_buf, format="png", bbox_inches='tight', dpi=120) # Slightly higher DPI for clarity
    img_buf.seek(0)
    plt.close(fig); 
    return img_buf

# --- Main Dashboard UI ---
st.title("SOAP Dashboard")
st.markdown("Contribute to the project here: [use.soap.fyi](https://use.soap.fyi)")

if not engine:
    st.error("🔴 CRITICAL: Database connection failed. Dashboard cannot operate.")
    st.stop()

TABS = {
    "Approval Ratings": "tab1_dist", 
    "Trends & Comparison": "tab2_trends", 
    "Valence Similarity": "tab3_valence_similarity" 
}
TAB_NAMES = list(TABS.keys()); TAB_IDS = list(TABS.values())
if 'active_tab' not in st.session_state: st.session_state.active_tab = TAB_IDS[0]
cols_radio = st.columns(len(TAB_NAMES))
for i, tab_name in enumerate(TAB_NAMES):
    if cols_radio[i].button(tab_name, key=f"tab_button_{TAB_IDS[i]}", use_container_width=True):
        st.session_state.active_tab = TAB_IDS[i]
st.markdown("---") 

if st.session_state.active_tab == "tab1_dist":
    st.header("All Approval Ratings")
    st.markdown("Shows 'Approve', 'Neutral', 'Disapprove' votes based on word sentiment. Politicians with fewer than selected minimum scorable votes excluded.")
    min_votes_for_dist_tab1 = st.slider( 
        "Filter chart by minimum number of submissions:", 
        min_value=1, max_value=100, value=10, step=1, key="dist_min_votes_slider_tab1"
    )
    df_sentiment_dist_tab1 = fetch_sentiment_distribution_per_politician(
        engine, 
        min_total_votes_threshold=min_votes_for_dist_tab1,
        sort_by_total_votes=False # For Tab 1, sort by approval primarily
    ) 
    if not df_sentiment_dist_tab1.empty:
        sentiment_categories = ['approve_percent', 'neutral_percent', 'disapprove_percent']
        category_colors_map = {'approve_percent': 'mediumseagreen', 'neutral_percent': 'lightgrey', 'disapprove_percent': 'lightcoral'}
        plotted_categories = [cat for cat in sentiment_categories if cat in df_sentiment_dist_tab1.columns]
        category_colors = [category_colors_map[cat] for cat in plotted_categories]
        if plotted_categories: 
            dist_img = plot_stacked_horizontal_bar_to_image(
                df_sentiment_dist_tab1, categories=plotted_categories, category_colors=category_colors,
                title='Approval Rating Distribution by Politician', xlabel='Percentage of Votes (%)', ylabel='', 
                top_n=len(df_sentiment_dist_tab1), decimal_places=1 
            )
            if dist_img: st.image(dist_img, use_container_width=True)
        else: st.info("Not enough distinct sentiment categories with data for distribution chart.")
    else: st.info(f"No politicians meet threshold of {min_votes_for_dist_tab1} scorable votes for distribution.")
    with st.expander("View Sentiment Distribution Data"):
        if not df_sentiment_dist_tab1.empty:
            df_display_dist = df_sentiment_dist_tab1.copy()
            for col in ['approve_percent', 'neutral_percent', 'disapprove_percent']:
                df_display_dist[col] = df_display_dist[col].map(lambda x: f"{x:.1f}%" if pd.notna(x) else "N/A")
            st.dataframe(df_display_dist[['politician_name', 'approve_percent', 'neutral_percent', 'disapprove_percent', 'total_votes']], 
                         use_container_width=True, hide_index=True)
        else: st.caption("No data to display.")

elif st.session_state.active_tab == "tab2_trends":
    # ... (Tab 2 content - IDENTICAL to your last full version with robust multiselect) ...
    st.header("Weekly Trends & Comparison")
    politicians_df_list_tab2 = fetch_politicians_list(engine)
    default_politician_ids_weekly_tab2 = [1] 
    default_politician_names_weekly_tab2 = []
    if not politicians_df_list_tab2.empty and default_politician_ids_weekly_tab2:
        default_politician_names_weekly_tab2 = politicians_df_list_tab2[
            politicians_df_list_tab2['politician_id'].isin(default_politician_ids_weekly_tab2)
        ]['name'].tolist()
    
    selected_politician_names_tab2 = [] 
    if not politicians_df_list_tab2.empty:
        all_politician_names_tab2 = sorted(politicians_df_list_tab2['name'].unique().tolist())
        options_with_all_tab2 = ["All Politicians"] + all_politician_names_tab2
        
        if 'selected_names_weekly_trend_tab2' not in st.session_state:
            st.session_state.selected_names_weekly_trend_tab2 = default_politician_names_weekly_tab2 if default_politician_names_weekly_tab2 else ["All Politicians"]
        
        current_default_tab2 = [name for name in st.session_state.selected_names_weekly_trend_tab2 if name in options_with_all_tab2]
        if not current_default_tab2: 
             current_default_tab2 = default_politician_names_weekly_tab2 if default_politician_names_weekly_tab2 and all(n in options_with_all_tab2 for n in default_politician_names_weekly_tab2) else ["All Politicians"]
        
        selected_options_tab2 = st.multiselect(
            "Select Politicians for Trend Analysis:", options=options_with_all_tab2,
            default=current_default_tab2, 
            key="politician_multiselector_weekly_trend_tab2", 
            help="Choose one or more politicians. Select 'All Politicians' to see everyone."
        )
        st.session_state.selected_names_weekly_trend_tab2 = selected_options_tab2 

        if "All Politicians" in st.session_state.selected_names_weekly_trend_tab2:
            selected_politician_names_tab2 = all_politician_names_tab2
        else: selected_politician_names_tab2 = st.session_state.selected_names_weekly_trend_tab2
    else: st.warning("Politician list unavailable for selection.")
    
    selected_politician_ids_for_query_tab2 = []
    if selected_politician_names_tab2 and not politicians_df_list_tab2.empty:
        politician_names_map_tab2 = pd.Series(politicians_df_list_tab2.politician_id.values, index=politicians_df_list_tab2.name).to_dict()
        for name in selected_politician_names_tab2:
            pid = politician_names_map_tab2.get(name)
            if pid is not None: selected_politician_ids_for_query_tab2.append(int(pid))
    
    if selected_politician_ids_for_query_tab2:
        if len(selected_politician_names_tab2) == 1: st.subheader(f"Trend for: {selected_politician_names_tab2[0]}")
        elif len(selected_politician_names_tab2) <= 7: st.subheader(f"Trend Comparison")
        else: st.subheader(f"Trend Comparison"); st.markdown(f"**Displaying trends for {len(selected_politician_names_tab2)} selected politicians.**")
        
        weekly_df_multiple_tab2 = fetch_weekly_approval_trends_for_selected_politicians(engine, selected_politician_ids_for_query_tab2)
        if not weekly_df_multiple_tab2.empty and 'weekly_approval_rating_percent' in weekly_df_multiple_tab2.columns and weekly_df_multiple_tab2['weekly_approval_rating_percent'].notna().any():
            weekly_trend_img_tab2 = plot_multiline_chart_to_image(
                weekly_df_multiple_tab2, x_col='week_start_date', y_col='weekly_approval_rating_percent', 
                group_col='politician_name', title=f'', xlabel='Week Start Date', ylabel='Approval Rating (%)', decimal_places=0 
            )
            if weekly_trend_img_tab2: st.image(weekly_trend_img_tab2, use_container_width=True)
        else: st.info(f"No weekly approval rating data for the selected politician(s).")
        
        with st.expander("View Weekly Trend Data (Approval Trends Tab)"): 
            if not weekly_df_multiple_tab2.empty:
                df_display_weekly_tab2 = weekly_df_multiple_tab2.copy()
                if 'weekly_approval_rating_percent' in df_display_weekly_tab2.columns:
                     df_display_weekly_tab2['weekly_approval_rating_percent'] = df_display_weekly_tab2['weekly_approval_rating_percent'].map(lambda x: f"{x:.0f}%" if pd.notna(x) else "N/A")
                cols_to_display_tab2 = ['politician_name', 'year_week', 'week_start_date', 'weekly_approval_rating_percent', 'total_votes_in_week']
                cols_to_display_tab2 = [col for col in cols_to_display_tab2 if col in df_display_weekly_tab2.columns]
                st.dataframe(df_display_weekly_tab2[cols_to_display_tab2], use_container_width=True, hide_index=True)
            else: st.caption("No data to display.")
    elif not politicians_df_list_tab2.empty: st.info("ℹ️ Select politician(s) above to see their weekly approval rating trends.")
    else: st.info("Waiting for politician list to load or database connection...")


elif st.session_state.active_tab == "tab3_valence_similarity":
    st.header("Valence Similarity Matrix")
    st.markdown("Heatmap shows similarity of words submitted in terms of valence (positive or negative). "
                "Score closer to 1 indicates a more similar sentiment profile. ")

    # Fetch all politicians who have at least 1 scorable vote.
    # This df_all_for_selection_tab3 will be sorted by total_votes DESC.
    df_all_for_selection_tab3 = fetch_sentiment_distribution_per_politician(
        engine, 
        min_total_votes_threshold=1, # Get all with at least 1 scorable vote
        sort_by_total_votes=True     # NEW: Sort this fetched data by total_votes
    )
    
    available_politicians_for_similarity_tab3 = []
    if not df_all_for_selection_tab3.empty:
        # These names are now sorted by total_votes DESC
        available_politicians_for_similarity_tab3 = df_all_for_selection_tab3['politician_name'].unique().tolist()

    selected_politician_names_tab3 = [] 
    if available_politicians_for_similarity_tab3:
        options_with_all_tab3 = ["All Available Politicians"] + available_politicians_for_similarity_tab3
        
        if 'selected_names_heatmap_tab3' not in st.session_state:
            # Default to top 10 by total_votes (since available_politicians_for_similarity_tab3 is sorted by it)
            default_heatmap_selection_tab3 = available_politicians_for_similarity_tab3[:min(5, len(available_politicians_for_similarity_tab3))]
            if not default_heatmap_selection_tab3 : default_heatmap_selection_tab3 = ["All Available Politicians"]
            st.session_state.selected_names_heatmap_tab3 = default_heatmap_selection_tab3
        
        current_default_tab3 = [name for name in st.session_state.selected_names_heatmap_tab3 if name in options_with_all_tab3]
        if not current_default_tab3:
             default_heatmap_selection_tab3 = available_politicians_for_similarity_tab3[:min(5, len(available_politicians_for_similarity_tab3))]
             if not default_heatmap_selection_tab3: default_heatmap_selection_tab3 = ["All Available Politicians"]
             current_default_tab3 = default_heatmap_selection_tab3
        
        selected_options_tab3 = st.multiselect(
            "Select Politicians for Similarity Matrix (Heatmap shows selected, up to 30):",
            options=options_with_all_tab3, # Options are sorted by total_votes
            default=current_default_tab3,
            key="politician_multiselector_heatmap_tab3",
            help="Choose politicians. Heatmap will be ordered by total submissions."
        )
        st.session_state.selected_names_heatmap_tab3 = selected_options_tab3

        if "All Available Politicians" in st.session_state.selected_names_heatmap_tab3:
            selected_politician_names_tab3 = available_politicians_for_similarity_tab3
        else:
            selected_politician_names_tab3 = st.session_state.selected_names_heatmap_tab3
        
        MAX_HEATMAP_POLITICIANS = 30 
        if len(selected_politician_names_tab3) > MAX_HEATMAP_POLITICIANS:
            st.warning(f"Displaying heatmap for the top {MAX_HEATMAP_POLITICIANS} of {len(selected_politician_names_tab3)} selected politicians (by total submissions) for readability.")
            # If "All" was chosen, selected_politician_names_tab3 is already sorted by total_votes
            # If user manually selected, we need to get their selection from df_all_for_selection_tab3 to preserve order
            if "All Available Politicians" in st.session_state.selected_names_heatmap_tab3:
                 selected_politician_names_tab3 = df_all_for_selection_tab3['politician_name'].head(MAX_HEATMAP_POLITICIANS).tolist()
            else: 
                 # Filter df_all_for_selection_tab3 by the user's selection, then take top N
                 # This preserves the total_votes order among the user's selection.
                 temp_df_selected = df_all_for_selection_tab3[df_all_for_selection_tab3['politician_name'].isin(selected_politician_names_tab3)]
                 selected_politician_names_tab3 = temp_df_selected['politician_name'].head(MAX_HEATMAP_POLITICIANS).tolist()

    else:
        st.info("No politicians found with scorable votes for similarity analysis.")


    if selected_politician_names_tab3 and not df_all_for_selection_tab3.empty:
        # Filter the df_all_for_selection_tab3 to get data for ONLY selected politicians
        # The order of selected_politician_names_tab3 is now by total_votes (desc)
        df_for_similarity_calc = df_all_for_selection_tab3[
            df_all_for_selection_tab3['politician_name'].isin(selected_politician_names_tab3)
        ].copy()
        
        # Ensure the order for the matrix is exactly as in selected_politician_names_tab3
        df_for_similarity_calc = df_for_similarity_calc.set_index('politician_name').reindex(selected_politician_names_tab3).reset_index()
        df_for_similarity_calc.dropna(subset=['politician_name'], inplace=True) 

        if not df_for_similarity_calc.empty and len(df_for_similarity_calc) > 1:
            politician_names_for_matrix = df_for_similarity_calc['politician_name'].tolist() 
            feature_vectors = df_for_similarity_calc[['approve_percent', 'neutral_percent', 'disapprove_percent']].values

            if feature_vectors.ndim == 2 and feature_vectors.shape[0] > 1:
                similarity_matrix_valence = cosine_similarity(feature_vectors)
                similarity_df_valence = pd.DataFrame(
                    similarity_matrix_valence, 
                    index=politician_names_for_matrix, 
                    columns=politician_names_for_matrix
                )
                
                heatmap_img_valence = plot_similarity_heatmap_to_image(
                    similarity_df_valence, 
                    title="Politician Valence Similarity"
                )
                if heatmap_img_valence:
                    st.image(heatmap_img_valence, use_container_width=True)
                else:
                    if not (len(df_for_similarity_calc) <=1 and selected_politician_names_tab3):
                        st.info(f"Not enough data or politicians to generate valence similarity heatmap for the current selection.")

                with st.expander("View Selected Similarity Matrix (Data)"):
                    st.dataframe(similarity_df_valence.style.format("{:.3f}"), use_container_width=True)
            else:
                st.warning("Could not generate valid feature vectors for valence similarity from selection.")
        elif len(df_for_similarity_calc) <=1 and selected_politician_names_tab3 : 
             st.info(f"Need to select at least two politicians for similarity analysis.")
    elif available_politicians_for_similarity_tab3: 
        st.info("ℹ️ Select politician(s) above to generate the similarity matrix.")


st.markdown("---")
st.caption(f"""
    © Copyright 2024-2025 [soap.fyi](https://soap.fyi). All rights reserved.""")