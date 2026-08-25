const events = {
  startWorkout: "Start Workout",
  joinRoom: "Join Room",
  drawCards: "Draw Cards",
};

const Analytics = {
  track(event, data) {
    if (typeof window.umami?.track !== "function") return;

    window.umami.track(event, data);
  },

  startWorkout(data) {
    this.track(events.startWorkout, data);
  },

  joinRoom(data) {
    this.track(events.joinRoom, data);
  },

  drawCards(data) {
    this.track(events.drawCards, data);
  },

  changeMultiplier(data) {
    this.track(events.changeMultiplier, data);
  },
};

export default Analytics;
