import API from "./lib/api.js";
import Store from "./lib/store.js";
import LoginPage from "./pages/login.js";
import HomePage from "./pages/home.js";
import SpeakingPage from "./pages/speaking.js";
import WritingEmailPage from "./pages/writing-email.js";
import WritingDiscussionPage from "./pages/writing-discussion.js";
import MemorizePage from "./pages/memorize.js";
import ImportPage from "./pages/import.js";
// import VocabPage from "./pages/vocab.js"; // 단어장 기능 비활성화

const app = document.getElementById("app");

async function checkAuth() {
    try {
        const res = await API.get("/api/me");
        if (res.ok) {
            Store.setUser({ user_id: res.user_id, username: res.username });
            return true;
        }
    } catch {}
    Store.clearUser();
    return false;
}

async function route() {
    const hash = location.hash || "#/";
    document.onkeydown = null;
    app.ontouchstart = null;
    app.ontouchend = null;

    if (hash === "#/login") {
        LoginPage(app);
        return;
    }

    const authed = await checkAuth();
    if (!authed) {
        location.hash = "#/login";
        return;
    }

    if (hash === "#/" || hash === "") {
        HomePage(app);
    } else if (hash === "#/speaking") {
        SpeakingPage(app);
    } else if (hash === "#/speaking/memorize") {
        MemorizePage(app, "speaking_interview");
    } else if (hash === "#/writing-email") {
        WritingEmailPage(app);
    } else if (hash === "#/writing-email/memorize") {
        MemorizePage(app, "writing_email");
    } else if (hash === "#/writing-discussion") {
        WritingDiscussionPage(app);
    } else if (hash === "#/writing-discussion/memorize") {
        MemorizePage(app, "writing_discussion");
    } else if (hash === "#/import") {
        ImportPage(app);
    // } else if (hash === "#/vocab") {
    //     VocabPage(app); // 단어장 기능 비활성화
    } else {
        location.hash = "#/";
    }
}

window.addEventListener("hashchange", route);

// Register service worker
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/static/sw.js").catch(() => {});
}

route();
