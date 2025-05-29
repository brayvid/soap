# Copyright 2024-2025 soap.fyi <https://soap.fyi>
import streamlit as st
import pandas as pd
from sqlalchemy import create_engine, text
import os
import matplotlib.pyplot as plt
import seaborn as sns
from io import BytesIO

# --- Page Configuration ---
st.set_page_config(
    layout="wide", 
    page_title="SOAP Dashboard",
    page_icon="🫧"
)

# --- Database Connection ---
DB_USER_LOCAL = 'local_ds_user'
DB_PASSWORD_LOCAL = 'a_secure_local_password' # YOUR LOCAL DS USER PASSWORD
DB_HOST_LOCAL = 'localhost'
DB_PORT_LOCAL = '5432'
DB_NAME_LOCAL = 'my_local_copy_db'

DB_USER_PROD = os.environ.get('PROD_DB_USER')
DB_PASSWORD_PROD = os.environ.get('PROD_DB_PASSWORD')
DB_HOST_PROD = os.environ.get('PROD_DB_HOST')
DB_PORT_PROD = os.environ.get('PROD_DB_PORT', '5432')
DB_NAME_PROD = os.environ.get('PROD_DB_NAME')

DEPLOY_ENV = os.environ.get('DEPLOY_ENV', 'DEVELOPMENT').upper()

@st.cache_resource
def get_engine():
    db_connection_str = None
    db_config = None
    # status_message_area = st.empty() # No explicit status messages at top

    try:
        if DEPLOY_ENV == 'PRODUCTION':
            if "prod_db" in st.secrets and all(k in st.secrets.prod_db for k in ["username", "password", "host", "database"]):
                db_config = st.secrets.prod_db
                db_port = db_config.get("port", 5432)
                db_connection_str = f'postgresql+psycopg2://{db_config.username}:{db_config.password}@{db_config.host}:{db_port}/{db_config.database}'
            else:
                return None 
        else: 
            if "local_db" in st.secrets and all(k in st.secrets.local_db for k in ["username", "password", "host", "database"]):
                db_config = st.secrets.local_db
                db_port = db_config.get("port", 5432)
                db_connection_str = f'postgresql+psycopg2://{db_config.username}:{db_config.password}@{db_config.host}:{db_port}/{db_config.database}'
            else:
                return None
        
        if db_connection_str:
            engine = create_engine(db_connection_str)
            with engine.connect() as connection:
                connection.execute(text("SELECT 1")) 
            return engine
        else: 
            return None
    except Exception as e:
        return None
engine = get_engine()


# --- Data Fetching Functions (Cached) ---
@st.cache_data(ttl=600)
def fetch_politicians_list(_engine):
    if not _engine: return pd.DataFrame({'politician_id': [], 'name': []})
    query = text("SELECT politician_id, name FROM politicians ORDER BY name;")
    try:
        with _engine.connect() as connection:
            df = pd.read_sql(query, connection)
        return df
    except Exception as e:
        return pd.DataFrame({'politician_id': [], 'name': []})

@st.cache_data(ttl=600)
def fetch_sentiment_distribution_per_politician(_engine, min_total_votes_threshold=10):
    if not _engine: return pd.DataFrame()
    approve_threshold = 0.1 
    disapprove_threshold = -0.1

    query = text(f"""
        WITH VoteSentimentCategories AS (
            SELECT
                v.politician_id,
                CASE
                    WHEN w.sentiment_score > {approve_threshold} THEN 'Approve'
                    WHEN w.sentiment_score < {disapprove_threshold} THEN 'Disapprove'
                    ELSE 'Neutral' 
                END AS sentiment_category
            FROM
                votes AS v
            JOIN
                words AS w ON v.word_id = w.word_id
            WHERE
                w.sentiment_score IS NOT NULL 
        ),
        PoliticianSentimentCounts AS (
            SELECT
                politician_id,
                sentiment_category,
                COUNT(*) AS category_count
            FROM
                VoteSentimentCategories
            GROUP BY
                politician_id, sentiment_category
        ),
        PoliticianTotalScorableVotes AS (
            SELECT
                politician_id,
                COUNT(*) AS total_votes
            FROM
                VoteSentimentCategories 
            GROUP BY
                politician_id
        )
        SELECT
            p.politician_id,
            p.name AS politician_name,
            COALESCE(SUM(CASE WHEN psc.sentiment_category = 'Approve' THEN psc.category_count ELSE 0 END) * 100.0 / NULLIF(ptv.total_votes, 0), 0) AS approve_percent,
            COALESCE(SUM(CASE WHEN psc.sentiment_category = 'Disapprove' THEN psc.category_count ELSE 0 END) * 100.0 / NULLIF(ptv.total_votes, 0), 0) AS disapprove_percent,
            COALESCE(SUM(CASE WHEN psc.sentiment_category = 'Neutral' THEN psc.category_count ELSE 0 END) * 100.0 / NULLIF(ptv.total_votes, 0), 0) AS neutral_percent,
            ptv.total_votes
        FROM
            politicians AS p
        JOIN 
            PoliticianTotalScorableVotes AS ptv ON p.politician_id = ptv.politician_id
        LEFT JOIN 
            PoliticianSentimentCounts AS psc ON p.politician_id = psc.politician_id
        WHERE 
            ptv.total_votes >= :min_votes_threshold 
        GROUP BY
            p.politician_id, p.name, ptv.total_votes
        ORDER BY
            approve_percent DESC, disapprove_percent ASC, neutral_percent DESC, p.name ASC;
    """)
    try:
        with _engine.connect() as connection:
            df = pd.read_sql(query, connection, params={'min_votes_threshold': min_total_votes_threshold})
        for col in ['approve_percent', 'disapprove_percent', 'neutral_percent']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
        return df
    except Exception as e:
        return pd.DataFrame()

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
                THEN (((SUM(w.sentiment_score) / COUNT(v.vote_id)) / 2.0) + 0.5) * 100.0 
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
        return pd.DataFrame()

# --- Plotting Helper Functions ---
def plot_stacked_horizontal_bar_to_image(df, categories, category_colors, title, xlabel, ylabel, top_n=20, decimal_places=1):
    if df.empty or not all(cat in df.columns for cat in categories):
        return None

    data_to_plot = df.head(top_n).copy()
    for cat in categories: 
        data_to_plot[cat] = pd.to_numeric(data_to_plot[cat], errors='coerce').fillna(0)

    plot_df_ready = data_to_plot.set_index('politician_name')[categories].iloc[::-1]
    
    num_politicians = len(plot_df_ready)
    # Adjust figsize for potentially wider display if not in a narrow column
    fig_height = max(6, min(15, 2 + num_politicians * 0.7)) 
    fig_width = 12 # Increased width for full-page display

    fig, ax = plt.subplots(figsize=(fig_width, fig_height))

    plot_df_ready.plot(kind='barh', stacked=True, color=category_colors, ax=ax, width=0.8)

    ax.set_title(title, fontsize=16, pad=15, weight='bold')
    ax.set_xlabel(xlabel, fontsize=13)
    ax.set_ylabel(ylabel, fontsize=13)
    ax.set_xlim(0, 105) 
    ax.legend(title="Sentiment Category", bbox_to_anchor=(1.02, 1), loc='upper left', fontsize='small')

    for p_index, (idx, row) in enumerate(plot_df_ready.iterrows()):
        cumulative_width = 0
        for i, val in enumerate(row):
            if val > 3: 
                 label_x_pos = cumulative_width + (val / 2)
                 ax.text(label_x_pos, p_index, f'{val:.{decimal_places}f}%', 
                         ha='center', va='center', color='white', fontsize=9, weight='bold',
                         bbox=dict(boxstyle="round,pad=0.1", fc='black', alpha=0.3, ec='none')
                        )
            cumulative_width += val
            
    plt.tight_layout(rect=[0, 0, 0.85, 1]) 
    
    img_buf = BytesIO()
    fig.savefig(img_buf, format="png", bbox_inches='tight', dpi=100)
    img_buf.seek(0)
    plt.close(fig)
    return img_buf

def plot_multiline_chart_to_image(df, x_col, y_col, group_col, title, xlabel, ylabel, color_palette="viridis", decimal_places=0):
    if df.empty or x_col not in df.columns or y_col not in df.columns or group_col not in df.columns or df[y_col].isnull().all():
        return None
    
    unique_groups = df[group_col].nunique()
    fig_height = max(6, min(12, 5 + unique_groups * 0.3)) 
    fig_width = 14 # Standard width for full-page line chart

    fig, ax = plt.subplots(figsize=(fig_width, fig_height))
    
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

    for line_index, politician_name in enumerate(df[group_col].unique()):
        politician_df = df[df[group_col] == politician_name]
        for index, row in politician_df.iterrows():
            if pd.notna(row[y_col]):
                ax.text(row[x_col], row[y_col] + 2, f"{row[y_col]:.{decimal_places}f}%", 
                        color=colors[line_index % len(colors)], 
                        ha="center", va="bottom", fontsize=8, weight='bold',
                        bbox=dict(boxstyle="round,pad=0.1", fc='white', alpha=0.5, ec='none'))


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

# --- Main Dashboard UI ---
st.title("SOAP Dashboard")
st.markdown("Contribute to the project here: [use.soap.fyi](https://use.soap.fyi)")
if not engine:
    st.error("🔴 CRITICAL: Database connection failed. Dashboard cannot operate.")
    st.stop()

# --- Section 1: Sentiment Distribution Overview ---
st.header("Approval Ratings")
st.markdown("Shows the percentage of 'Approve', 'Neutral', and 'Disapprove' votes based on word sentiment for each listed politician. Approval Rating = `(((Avg Sentiment Score / 2) + 0.5) * 100)`")

# Add a slider for min_total_votes_threshold
min_votes_for_dist = st.slider(
    "Filter chart by minimum number of submissions:", 
    min_value=1, max_value=100, value=10, step=1, key="dist_min_votes_slider"
)
df_sentiment_dist = fetch_sentiment_distribution_per_politician(engine, min_total_votes_threshold=min_votes_for_dist)

if not df_sentiment_dist.empty:
    sentiment_categories = ['approve_percent', 'neutral_percent', 'disapprove_percent']
    category_colors_map = {'approve_percent': 'mediumseagreen', 'neutral_percent': 'lightgrey', 'disapprove_percent': 'lightcoral'}
    
    plotted_categories = [cat for cat in sentiment_categories if cat in df_sentiment_dist.columns]
    category_colors = [category_colors_map[cat] for cat in plotted_categories]

    if plotted_categories: 
        dist_img = plot_stacked_horizontal_bar_to_image(
            df_sentiment_dist,
            categories=plotted_categories, 
            category_colors=category_colors,
            title='Approval Rating Distribution by Politician',
            xlabel='Percentage of Votes (%)',
            ylabel='', 
            top_n=len(df_sentiment_dist), 
            decimal_places=1 
        )
        if dist_img:
            st.image(dist_img, use_container_width=True) # Chart takes full available width
    else:
        st.info("Not enough distinct sentiment categories with data to display the distribution chart.")
else:
    st.info(f"No politicians meet the threshold of {min_votes_for_dist} scorable votes for sentiment distribution.")

with st.expander("View Sentiment Distribution Data"):
    if not df_sentiment_dist.empty:
        df_display_dist = df_sentiment_dist.copy()
        for col in ['approve_percent', 'disapprove_percent', 'neutral_percent']:
            df_display_dist[col] = df_display_dist[col].map(lambda x: f"{x:.1f}%" if pd.notna(x) else "N/A")
        st.dataframe(
            df_display_dist[['politician_name', 'approve_percent', 'neutral_percent', 'disapprove_percent', 'total_votes']], 
            use_container_width=True, 
            hide_index=True
        )
    else:
        st.caption("No data to display.")
st.markdown("---")


# --- Section 2: Weekly Approval Rating Trend ---
st.header("Approval Weekly Trends")

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
    
    if 'selected_politician_names_weekly_trend' not in st.session_state:
        st.session_state.selected_politician_names_weekly_trend = default_politician_names_weekly if default_politician_names_weekly else ["All Politicians"]
    
    # Place multiselect directly on the page
    selected_options = st.multiselect(
        "Select Politicians for Trend Analysis:", 
        options=options_with_all,
        default=st.session_state.selected_politician_names_weekly_trend, 
        key="politician_multiselector_weekly_trend_main", 
        help="Choose one or more politicians. Select 'All Politicians' to see everyone."
    )
    st.session_state.selected_politician_names_weekly_trend = selected_options

    if "All Politicians" in st.session_state.selected_politician_names_weekly_trend:
        selected_politician_names = all_politician_names 
    else:
        selected_politician_names = st.session_state.selected_politician_names_weekly_trend
else:
    st.warning("Politician list unavailable for selection.")

selected_politician_ids_for_query = []
if selected_politician_names and not politicians_df_list.empty:
    politician_names_map = pd.Series(politicians_df_list.politician_id.values, index=politicians_df_list.name).to_dict()
    for name in selected_politician_names:
        pid = politician_names_map.get(name)
        if pid is not None:
            selected_politician_ids_for_query.append(int(pid))

if selected_politician_ids_for_query:
    if len(selected_politician_names) == 1:
        st.subheader(f"Trend for: {selected_politician_names[0]}")
    elif len(selected_politician_names) <= 7 : 
         st.subheader(f"Trend Comparison")
    else:
         st.subheader(f"Trend Comparison")
         st.markdown(f"**Displaying trends for {len(selected_politician_names)} selected politicians.**") # Only show count if many
    
    weekly_df_multiple = fetch_weekly_approval_trends_for_selected_politicians(engine, selected_politician_ids_for_query)
    
    if not weekly_df_multiple.empty and 'weekly_approval_rating_percent' in weekly_df_multiple.columns and weekly_df_multiple['weekly_approval_rating_percent'].notna().any():
        
        weekly_trend_img = plot_multiline_chart_to_image(
            weekly_df_multiple,
            x_col='week_start_date',
            y_col='weekly_approval_rating_percent', 
            group_col='politician_name', 
            title=f'', 
            xlabel='Week Start Date',
            ylabel='Approval Rating (%)',
            decimal_places=0 
        )
        if weekly_trend_img:
            st.image(weekly_trend_img, use_container_width=True) # Chart takes full available width
    else:
        st.info(f"No weekly approval rating data with valid scores found for the selected politician(s).")
    
    with st.expander("View Data: Weekly Approval Trends"): 
        if not weekly_df_multiple.empty:
            df_display_weekly = weekly_df_multiple.copy()
            if 'weekly_approval_rating_percent' in df_display_weekly.columns:
                 df_display_weekly['weekly_approval_rating_percent'] = df_display_weekly['weekly_approval_rating_percent'].map(lambda x: f"{x:.0f}%" if pd.notna(x) else "N/A")
            cols_to_display = ['politician_name', 'year_week', 'week_start_date', 'weekly_approval_rating_percent', 'total_votes_in_week']
            cols_to_display = [col for col in cols_to_display if col in df_display_weekly.columns]
            st.dataframe(df_display_weekly[cols_to_display], use_container_width=True, hide_index=True)
        else:
            st.caption("No data to display.")

elif not politicians_df_list.empty: 
    st.info("Select politician(s) above to see their weekly approval rating trends.")
else:
    st.info("Waiting for politician list to load or database connection...")

st.markdown("---")
st.caption("© Copyright 2024-2025 [soap.fyi](https://soap.fyi). All rights reserved.")
