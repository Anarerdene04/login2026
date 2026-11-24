const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("운영 환경에서는 SESSION_SECRET 환경 변수를 설정해야 합니다.");
}

function readDatabase() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    const initialData = { users: [], posts: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
}

function writeDatabase(database) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(database, null, 2));
  fs.renameSync(temporaryFile, DATA_FILE);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const candidate = Buffer.from(hashPassword(password, user.salt).hash, "hex");
  const saved = Buffer.from(user.passwordHash, "hex");
  return candidate.length === saved.length && crypto.timingSafeEqual(candidate, saved);
}

function publicUser(user) {
  return { id: user.id, username: user.username };
}

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }
  next();
}

app.use(express.json({ limit: "20kb" }));
app.use(
  session({
    name: "login-board.sid",
    secret: SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }

  const user = readDatabase().users.find((item) => item.id === req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.json({ user: null });
  }
  res.json({ user: publicUser(user) });
});

app.post("/api/register", (req, res, next) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!/^[\p{L}\p{N}_-]{2,20}$/u.test(username)) {
    return res.status(400).json({ error: "아이디는 한글/영문/숫자/_/- 조합으로 2~20자여야 합니다." });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "비밀번호는 8~128자로 입력해 주세요." });
  }

  try {
    const database = readDatabase();
    if (database.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: "이미 사용 중인 아이디입니다." });
    }

    const credentials = hashPassword(password);
    const user = {
      id: crypto.randomUUID(),
      username,
      salt: credentials.salt,
      passwordHash: credentials.hash,
      createdAt: new Date().toISOString()
    };
    database.users.push(user);
    writeDatabase(database);

    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = user.id;
      res.status(201).json({ user: publicUser(user) });
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/login", (req, res, next) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";

  try {
    const user = readDatabase().users.find(
      (item) => item.username.toLowerCase() === username.toLowerCase()
    );
    if (!user || !verifyPassword(password, user)) {
      return res.status(401).json({ error: "아이디 또는 비밀번호를 확인해 주세요." });
    }

    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = user.id;
      res.json({ user: publicUser(user) });
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("login-board.sid", { httpOnly: true, sameSite: "lax" });
    res.status(204).end();
  });
});

app.get("/api/posts", (req, res, next) => {
  try {
    const database = readDatabase();
    const usersById = new Map(database.users.map((user) => [user.id, user.username]));
    const posts = database.posts
      .slice()
      .reverse()
      .map((post) => ({
        id: post.id,
        title: post.title,
        content: post.content,
        author: usersById.get(post.userId) || "알 수 없음",
        createdAt: post.createdAt
      }));
    res.json({ posts });
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts", requireLogin, (req, res, next) => {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";

  if (!title || title.length > 100) {
    return res.status(400).json({ error: "제목은 1~100자로 입력해 주세요." });
  }
  if (!content || content.length > 5000) {
    return res.status(400).json({ error: "내용은 1~5000자로 입력해 주세요." });
  }

  try {
    const database = readDatabase();
    const user = database.users.find((item) => item.id === req.session.userId);
    if (!user) {
      return res.status(401).json({ error: "로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요." });
    }

    const post = {
      id: crypto.randomUUID(),
      userId: user.id,
      title,
      content,
      createdAt: new Date().toISOString()
    };
    database.posts.push(post);
    writeDatabase(database);
    res.status(201).json({
      post: {
        id: post.id,
        title: post.title,
        content: post.content,
        author: user.username,
        createdAt: post.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." });
});

app.listen(PORT, () => {
  console.log(`로그인 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
