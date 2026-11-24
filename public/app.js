const authPanel = document.querySelector("#auth-panel");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authSubmit = document.querySelector("#auth-submit");
const authMessage = document.querySelector("#auth-message");
const accountArea = document.querySelector("#account-area");
const composer = document.querySelector("#composer");
const postForm = document.querySelector("#post-form");
const postMessage = document.querySelector("#post-message");
const postList = document.querySelector("#post-list");
const postCount = document.querySelector("#post-count");
let authMode = "login";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "요청을 처리하지 못했습니다.");
  }
  return response.status === 204 ? null : response.json();
}

function setAuthMode(mode) {
  authMode = mode;
  authTitle.textContent = mode === "login" ? "로그인" : "회원가입";
  authSubmit.textContent = mode === "login" ? "로그인" : "회원가입";
  authMessage.textContent = "";
  document.querySelector("#password").autocomplete = mode === "login" ? "current-password" : "new-password";
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

function showUser(user) {
  authPanel.hidden = Boolean(user);
  composer.hidden = !user;
  accountArea.replaceChildren();
  if (!user) return;

  const name = document.createElement("span");
  name.textContent = `${user.username}님`;
  const logout = document.createElement("button");
  logout.className = "text-button";
  logout.type = "button";
  logout.textContent = "로그아웃";
  logout.addEventListener("click", async () => {
    try {
      await request("/api/logout", { method: "POST" });
      showUser(null);
    } catch (error) {
      authMessage.textContent = error.message;
    }
  });
  accountArea.append(name, logout);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function renderPosts(posts) {
  postCount.textContent = `${posts.length}개의 글`;
  postList.replaceChildren();
  if (posts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "아직 게시글이 없어요. 첫 번째 이야기를 남겨보세요!";
    postList.append(empty);
    return;
  }

  posts.forEach((post) => {
    const card = document.createElement("article");
    card.className = "post-card";
    const topLine = document.createElement("div");
    topLine.className = "post-topline";
    const title = document.createElement("h3");
    title.textContent = post.title;
    const date = document.createElement("time");
    date.className = "post-date";
    date.dateTime = post.createdAt;
    date.textContent = formatDate(post.createdAt);
    const content = document.createElement("p");
    content.textContent = post.content;
    const author = document.createElement("div");
    author.className = "post-author";
    author.textContent = `by ${post.author}`;
    topLine.append(title, date);
    card.append(topLine, content, author);
    postList.append(card);
  });
}

async function loadPosts() {
  const { posts } = await request("/api/posts");
  renderPosts(posts);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.mode));
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.textContent = "";
  const formData = new FormData(authForm);
  try {
    const { user } = await request(`/api/${authMode === "login" ? "login" : "register"}`, {
      method: "POST",
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password")
      })
    });
    authForm.reset();
    showUser(user);
    await loadPosts();
  } catch (error) {
    authMessage.textContent = error.message;
  }
});

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  postMessage.textContent = "";
  const formData = new FormData(postForm);
  try {
    await request("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        title: formData.get("title"),
        content: formData.get("content")
      })
    });
    postForm.reset();
    await loadPosts();
  } catch (error) {
    postMessage.textContent = error.message;
  }
});

async function initialize() {
  try {
    const { user } = await request("/api/me");
    showUser(user);
    await loadPosts();
  } catch (error) {
    postList.textContent = error.message;
  }
}

initialize();
