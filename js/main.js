var socket;
var firstconnect = true;
var vlc;
var gui = require('nw.gui');
var kiosk = false;

//socket.io client side debug messages
//localStorage.setItem('debug', "*");
localStorage.setItem('debug', "");

var trailerIsRunning = false;

var trailers = trailersKIZ;

function connect() {

	vlc = document.getElementById("vlc");
	vlc.addEventListener("MediaPlayerStopped", playerStoppedEventHandler, false);
	vlc.addEventListener("MediaPlayerPlaying", playerStartedEventHandler, false);
	vlc.addEventListener("MediaPlayerEndReached", playerEndReachedEventHandler, false);


	writeLog("Trying to connect");


	if (firstconnect) {
		writeLog("erster connect");

		socket = io("http://192.168.0.29:3000");
		//socket = io("http://178.77.68.72:3000");

		socket.on("connect", function() {
			$("#status").html("Connected to Server");
			writeLog("CONNECTED TO SERVER");
			registerToServer();
		});

		socket.on("disconnect", function() {
			$("#status").html("Disconnected");
		});

		socket.on("reconnecting", function(nextRetry) {
			$("#status").html("Reconnecting in " + nextRetry + " milliseconds");
		});
		socket.on("reconnect_failed", function() {
			$("#status").html("Reconnect failed");
		});

		//write secret to screen and set timer to hide it again
		socket.on("setSecret", function(secret) {
			$("#secret").html(secret);
			setTimeout(function() {
				$("#secret").html("");
			}, 20000);
		});

		socket.on("hideSecret", function() {
			$("#secret").html("");
		});

		socket.on("playPause", function() {
			writeLog("Play/Pause Command received");
			togglePause();
		});

		socket.on("volumeChange", function(newVolume) {
			writeLog("Remote VolumeChange received: " + newVolume);
			setVolume(newVolume);

		});

		socket.on("playSpecifTrailer", function(trailerInternalName, trailerType) {
			writeLog("Play Specific Trailer Command received: " + trailerInternalName + " " + trailerType);
			playSpecificTrailer(trailerInternalName, trailerType);
			fullScreen();
		});

		socket.on("stopTrailer", function() {
			writeLog("Stop Trailer Command received");
			vlc.playlist.stop();
		});

		//hide the shown code immediately after the authentification was successful
		socket.on("hideCode", function() {
			$("#secret").html("");
			writeLog("HIDE CODE RECEIVED");
		});

		//returns true or false depenting if a trailer is played at the moment or not
		socket.on("isTrailerRunning", function(fn) {
			writeLog("Trailer is running: " + trailerIsRunning);
			if (trailerIsRunning) {
				fn(true);
			} else {
				fn(false);
			}
		});
		firstconnect = false;

	} else {
		writeLog("NOTfirstconnect");
		socket.connect("http://192.168.0.29:3000");
		//socket.connect("http://178.77.68.72:3000");
	}
}

function toggleKioskmode() {
	if (kiosk) {
		kiosk = false;
		gui.Window.get().leaveKioskMode();
	} else {
		gui.Window.get().enterKioskMode();
		kiosk = true;
	}
}


function disconnect() {
	writeLog("disconnect");
	socket.disconnect();
}


function fullScreen() {
	vlc.video.toggleFullscreen();
}

function playerStartedEventHandler(myEvent) {
	writeLog("Player Started Event");
	vlc.video.fullscreen = true;
	trailerIsRunning = true;
	setTimeout(function() {
		setVolume(50);

	}, 1000);
}

//fired when the player is in stop state
function playerStoppedEventHandler(myEvent) {
	writeLog("Player Stopped Event");
	vlc.video.fullscreen = false;
	trailerIsRunning = false;

}

//fired when a trailer is played until end and fire stop event
function playerEndReachedEventHandler(myEvent) {
	writeLog("Play List Ended Event");
	setTimeout(function() {
		writeLog("Playlist ist playing: " + vlc.playlist.isPlaying);
		if (!vlc.playlist.isPlaying) {
			vlc.playlist.stop();
		}
	}, 200);
}


function setVolume(newVolume) {
	vlc.audio.volume = newVolume;
}


function togglePause() {
	vlc.playlist.togglePause();
}

function playSpecificTrailer(trailerInternalName, trailerType) {
	writeLog("CLIENT WANTS TO PLAY: " + trailerInternalName + " " + trailerType);
	vlc.playlist.clear();
	for (var i = 0; i < trailers.length; i++) {
		if (trailers[i].interalName == trailerInternalName) {
			if (trailerType == "dt") {
				vlc.playlist.add(trailers[i].urlDE, trailers[i].movieName, "");
			}
			if (trailerType == "ov") {
				vlc.playlist.add(trailers[i].urlOV, trailers[i].movieName, "");
			}
		}
	}
	vlc.playlist.play();
}

//notify server that this is the video client
function registerToServer() {
	socket.emit("videoClientregister", function() {
		writeLog("Video Client successfully registered to Server");
		socket.emit("registerPlayList", trailers, function() {
			writeLog("Playlist sucessfully sent to server");
		});
	});
}

//logging with timestap
function writeLog(message) {
	console.log(new Date().getHours() + ":" + new Date().getMinutes() + ":" + new Date().getSeconds() + " " + message);
}