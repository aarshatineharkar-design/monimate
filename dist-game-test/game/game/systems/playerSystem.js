"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerSystem = void 0;
class PlayerSystem {
    constructor(player) {
        this.player = player;
    }
    getState() {
        return this.player;
    }
    getLocation() {
        return this.player.world.place;
    }
    /** The clean way for an activity or future world interaction to move the player. Only updates
     *  `place` — it does not touch x/y/scene/facing, which belong to movement/rendering concerns
     *  outside this step's scope (no collision or camera system exists here to keep in sync). */
    changeLocation(placeId) {
        this.player.world.place = placeId;
    }
    changeScene(scene) {
        this.player.world.scene = scene;
    }
    setMovementStatus(status) {
        this.player.world.movementStatus = status;
    }
    setCurrentActivity(activity) {
        this.player.attributes.currentActivity = activity;
    }
}
exports.PlayerSystem = PlayerSystem;
