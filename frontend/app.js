const form = document.getElementById("search-form");
const apiUrlInput = document.getElementById("api-url");
const keywordInput = document.getElementById("keyword");
const limitInput = document.getElementById("limit");
const statusElement = document.getElementById("status");
const summaryPanel = document.getElementById("summary-panel");
const summaryCards = document.getElementById("summary-cards");
const articlesPanel = document.getElementById("articles-panel");
const articlesList = document.getElementById("articles-list");

const savedApiUrl = window.localStorage.getItem("runtimeApiUrl");
if (savedApiUrl) {
  apiUrlInput.value = savedApiUrl;
}

const sentimentPill = (label) => `<span class="sentiment-pill ${label}">${label}</span>`;

const renderRankings = (rankings) => {
  if (!rankings.length) {
    summaryCards.innerHTML = "<p>No outlet rankings returned.</p>";
    return;
  }

  summaryCards.innerHTML = rankings
    .map(
      (item, index) => `
        <article class="summary-card">
          <p>#${index + 1}</p>
          <h3>${item.sourceName}</h3>
          ${sentimentPill(item.sentimentLabel)}
          <div class="metric-row"><span>Articles</span><strong>${item.articleCount}</strong></div>
          <div class="metric-row"><span>Compound</span><strong>${item.averageCompound}</strong></div>
          <div class="metric-row"><span>Positive</span><strong>${item.averagePositive}</strong></div>
          <div class="metric-row"><span>Negative</span><strong>${item.averageNegative}</strong></div>
          <div class="metric-row"><span>Neutral</span><strong>${item.averageNeutral}</strong></div>
        </article>
      `,
    )
    .join("");
};

const renderArticles = (articles) => {
  if (!articles.length) {
    articlesList.innerHTML = "<p>No article previews returned.</p>";
    return;
  }

  articlesList.innerHTML = articles
    .map(
      (article) => `
        <article class="article-card">
          <h3>${article.title}</h3>
          <p><strong>${article.sourceName}</strong> · Compound ${article.compound}</p>
          <p>${article.summary || "No summary available."}</p>
          <p><a href="${article.url}" target="_blank" rel="noreferrer">Read article</a></p>
        </article>
      `,
    )
    .join("");
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const apiUrl = apiUrlInput.value.trim().replace(/\/$/, "");
  const keyword = keywordInput.value.trim();
  const limit = limitInput.value.trim();

  if (!apiUrl || !keyword) {
    statusElement.textContent = "API URL and keyword are required.";
    return;
  }

  window.localStorage.setItem("runtimeApiUrl", apiUrl);
  statusElement.textContent = "Loading sentiment results...";
  summaryPanel.hidden = true;
  articlesPanel.hidden = true;

  try {
    const targetUrl = new URL(apiUrl);
    targetUrl.searchParams.set("keyword", keyword);
    targetUrl.searchParams.set("limit", limit || "10");

    const response = await fetch(targetUrl.toString());
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "Request failed.");
    }

    renderRankings(payload.rankings || []);
    renderArticles(payload.articles || []);
    summaryPanel.hidden = false;
    articlesPanel.hidden = false;
    statusElement.textContent = `Found ${payload.totalMatches ?? 0} matching articles.`;
  } catch (error) {
    statusElement.textContent = error instanceof Error ? error.message : "Unknown error.";
  }
});
