const Store = {
    user: null,
    currentSession: null,
    usedQuestionIds: [],

    setUser(user) {
        this.user = user;
    },

    clearUser() {
        this.user = null;
    },

    startSession(sessionId, type) {
        this.currentSession = { id: sessionId, type };
        this.usedQuestionIds = [];
    },

    addUsedQuestion(id) {
        this.usedQuestionIds.push(id);
    },

    getExcludeParam() {
        return this.usedQuestionIds.join(",");
    },

    endSession() {
        this.currentSession = null;
        this.usedQuestionIds = [];
    },
};

export default Store;
