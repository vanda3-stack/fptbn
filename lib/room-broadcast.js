// A shared room has many observers but one screen presenter at a time.
function createRoomBroadcast() {
    let presenter = null;
    return {
        claim(socketId) {
            if (presenter && presenter !== socketId) return false;
            presenter = socketId;
            return true;
        },
        owns(socketId) { return presenter === socketId; },
        release(socketId) {
            if (presenter !== socketId) return false;
            presenter = null;
            return true;
        }
    };
}
module.exports = { createRoomBroadcast };
