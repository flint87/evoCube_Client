var socket;
var vlc;
var gui = require('nw.gui');
var kiosk = false;

var fs = require('fs');

var serverIP;
var serverPort;
var cubeLocation;
var debugMode;

//socket.io client side debug messages
//localStorage.setItem('debug', "*");
localStorage.setItem('debug', "");

var trailerIsRunning = false;

var trailers;

var firstConnect = true;
var firstReconnect = true;

var staticContent = "";

function initClient() {
	fs.readFile('./clientConfig.json', 'utf-8', function(error, contents) {
		var config = JSON.parse(contents);
		serverIP = config.server.ip;
		serverPort = config.server.portNumber;
		cubeLocation = config.cubeLocation;
		$("#infoTitle").html(config.welcomeMessage);
		$("#infoTitle").html("Willkommen beim Movie Cube");
		if (config.debug == "false") {
			$("#playPause").hide(0);
			$("#fullscreen").hide(0);
			$("#kiosk").hide(0);
			$("#status").hide(0);
		}
		fs.readFile("./html/staticPicture.html", "utf8", function(err, data) {
			if (error) writeLog(err);
			//writeLog(data);
			//staticContent = jQuery.parseHTML(data);
			staticContent = data;
			//writeLog("STARTING CONNECT");
			connect();
		});

	});

}

function connect() {


	vlc = document.getElementById("vlc");
	vlc.addEventListener("MediaPlayerStopped", playerStoppedEventHandler, false);
	vlc.addEventListener("MediaPlayerPlaying", playerStartedEventHandler, false);
	vlc.addEventListener("MediaPlayerEndReached", playerEndReachedEventHandler, false);


	writeLog("Trying to connect to " + "http://" + serverIP + ":" + serverPort);

	socket = io("http://" + serverIP + ":" + serverPort);
	//writeLog("http://" + serverIP + ":" + serverPort);

	socket.on("connect", function() {
		$("#status").html("Connected to Server");
		writeLog("CONNECTED TO SERVER");
		firstReconnect = true;
		//give the server a few moments to init before registering
		setTimeout(function() {
			registerToServer();

		}, 1000);

	});

	socket.on("disconnect", function() {
		$("#status").html("Disconnected");
	});

	socket.on("reconnecting", function(nextRetry) {
		$("#status").html("Reconnecting in " + nextRetry + " milliseconds");
		//make sure that only one reconnecting attempt is logged
		if (firstReconnect) {
			saveTrackingMessage(cubeLocation, "connectionEvent", "unexpectedReconnect", serverIP + ":" + serverPort);
			firstReconnect = false;
		}

	});
	socket.on("reconnect_failed", function() {
		$("#status").html("Reconnect failed");
	});

	//write secret to screen and set timer to hide it again
	socket.on("setSecret", function(secret) {
		$("#secret").html(secret);
		$('#myModal').modal();
		setTimeout(function() {
			$("#secret").html("");
			$('#myModal').modal('hide');
		}, 20000);
	});

	socket.on("hideSecret", function() {
		$("#secret").html("");
		$('#myModal').modal('hide');
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
		writeLog("Hide code received");
		$('#myModal').modal('hide');
	});

	//server has an updated video playlist
	socket.on("updatePlaylist", function(fn) {
		location.reload();
		//loadFile();
		//fn();
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
		setVolume(100);

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
	
	vlc.playlist.clear();
	for (var i = 0; i < trailers.length; i++) {
		if (trailers[i].interalName == trailerInternalName) {
			if (trailerType == "dt") {
				vlc.playlist.add(trailers[i].urlDE, trailers[i].movieName, "");
				writeLog("CLIENT WANTS TO PLAY: " + trailerInternalName + " " + trailerType + " " + trailers[i].urlDE);
			}
			if (trailerType == "ov") {
				vlc.playlist.add(trailers[i].urlOV, trailers[i].movieName, "");
				writeLog("CLIENT WANTS TO PLAY: " + trailerInternalName + " " + trailerType + " " + trailers[i].urlOV);
			}
		}
	}
	vlc.playlist.play();
}

//notify server that this is the video client
function registerToServer() {
	writeLog("Trying to register at the server");
	socket.emit("videoClientregister", cubeLocation, function(message) {
		if (message) {
			if (firstConnect) {
				loadFile();
				firstConnect = false;
			}
			writeLog("Video Client successfully registered to server");
		} else {
			writeLog("Server not rdy at the moment. Pls try again later.");
		}
	});
}

//load the file with all movies from the server based on the config parameter
function loadFile() {

	$.get("http://" + serverIP + ":" + serverPort + "/data/" + cubeLocation + ".json", function(data) {
		writeLog("File loaded successfully");
		trailers = data;
		var innerContent;
		for (var u = 0; u < trailers.length; u++) {
			innerContent = "<table border=\"0\"><thead><tr><th colspan=\"3\" class=\"movieTitleHeader\"><h1>" +
				trailers[u].movieName + "</h1></th></tr></thead><tbody><tr><td rowspan=\"9\" class=\"imageDiv\" ><img class=\"moviePoster\" src=\"" +
				trailers[u].imageURL + "\"></img></td><td class=\"tableHeader\"><p>Jahr:</p></td><td class=\"tableContent\"><p>" +
			//"../images/cubeImage.jpg" + "\"></img></td><td class=\"tableHeader\"><p>Jahr:</p></td><td class=\"tableContent\"><p>" + 

			trailers[u].year + "</p></td></tr><tr><td class=\"tableHeader\"><p>OV Name:</p></td><td class=\"tableContent\"><p>" +
				trailers[u].ovName + "</p></td></tr><tr><td class=\"tableHeader\"><p>OV Sprache:</p></td><td class=\"tableContent\"><p>" +
				trailers[u].ov;


			innerContent = innerContent + "</p></td></tr><tr><td class=\"tableHeader\"><p>Land:</p></td><td class=\"tableContent\"><p>";

			for (z = 0; z < trailers[u].country.length; z++) {
				if (z !== trailers[u].country.length - 1) {
					innerContent = innerContent + trailers[u].country[z] + ",<br>";
				} else {
					innerContent = innerContent + trailers[u].country[z];
				}
			}

			innerContent = innerContent + "</p></td></tr><tr><td class=\"tableHeader\"><p>Genre:</p></td><td class=\"tableContent\"><p>";

			for (z = 0; z < trailers[u].genre.length; z++) {
				if (z !== trailers[u].genre.length - 1) {
					innerContent = innerContent + trailers[u].genre[z] + ",<br>";
				} else {
					innerContent = innerContent + trailers[u].genre[z];
				}
			}

			innerContent = innerContent + "</p></td></tr><tr><td class=\"tableHeader\"><p>Stimmung:</p></td><td class=\"tableContent\"><p>";

			for (z = 0; z < trailers[u].mood.length; z++) {
				if (z !== trailers[u].mood.length - 1) {
					innerContent = innerContent + trailers[u].mood[z] + ", ";
				} else {
					innerContent = innerContent + trailers[u].mood[z];
				}
			}

			innerContent = innerContent + "</p></td></tr><tr><td class=\"tableHeader\"><p>Regisseur:</p></td><td class=\"tableContent\"><p>" +
				trailers[u].director + "</p></td></tr><tr><td class=\"tableHeader\"><p>Schausp.:</p></td><td class=\"tableContent\"><p>";

			for (z = 0; z < trailers[u].actors.length; z++) {
				if (z !== trailers[u].actors.length - 1) {
					innerContent = innerContent + trailers[u].actors[z] + ", ";
				} else {
					innerContent = innerContent + trailers[u].actors[z];
				}
			}
			innerContent = innerContent + "</p></td></tr><tr><td colspan=\"2\" class=\"tableContent\" style=\"text-align:center; width:100%\"><p> " +
				trailers[u].available + "</p></td></tr></tbody></table>";


			if (u === 0) {

				$("#movieCarousel").append("<li data-target=\"#myCarousel\" data-slide-to=\"" + u + "\" class=\"active\"></li>");
				$("#carouselItems").append("<div class=\"item active\"><div class=\"fill myCarouselContent\" style=\"background-color:#CCCCCC;\"><div class=\"carousel-caption\">" + innerContent + "<p class=\"anouncer\">Movie Cube Feedbackfragebogen ausfüllen und 1€ Ticketermäßigung abholen!</p></div></div></div>");
				$("#movieCarousel").append("<li data-target=\"#myCarousel\" data-slide-to=\"14\" class=\"active\"></li>");
				//$("#carouselItems").append(staticContent);
				//writeLog(staticContent);

			} else {

				$("#movieCarousel").append("<li data-target=\"#myCarousel\" data-slide-to=\"" + u + "\"></li>");
				$("#carouselItems").append("<div class=\"item\"><div class=\"fill myCarouselContent\" style=\"background-color:#CCCCCC;\"><div class=\"carousel-caption\">" + innerContent + "<br><br><img id=\"\" class=\"logos\" src=\"../images/kiZ_logo.png\"></img> <img id=\"\" class=\"logos\" src=\"../images/evolaris_logo.gif\"></img></div></div></div>");
				$("#movieCarousel").append("<li data-target=\"#myCarousel\" data-slide-to=\"14\" class=\"active\"></li>");
				//$("#carouselItems").append(staticContent);
				
			}

		}

		//$(".staticCubeImg").attr("src", "../images/cube_" + cubeLocation + ".jpg");

		$('.carousel').carousel({
			interval: 25000 //changes the speed
		});

		saveTrackingMessage(cubeLocation, "connectionEvent", "successfullyRegisteredToServer", serverIP + ":" + serverPort);
		//console.log(trailers);
	}).fail(function() {
		writeLog("Error loading trailer file!");
	});

}

//save new tracking message to file
function saveTrackingMessage(locationName, eventType, message, parameter) {
	console.log("I WANT TO SAVE A TRACKING MESSAGE");
	fs.readFile("./videoClientLog.csv", "utf8", function(err, data) {
		if (err) {
			console.log("Reading error for tracking file");
			console.log(err);
		} else {
			data = data + getTimeStamp() + ";" + locationName + ";" + eventType + ";" + message + ";" + parameter + "\n";
			fs.writeFile("./videoClientLog.csv", data, "utf8", function(err) {
				if (err) {
					console.log(err);
				} else {
					//console.log("Tracking messages written");
				}
			});
		}
	});
}

//get timestamp for the log file
function getTimeStamp() {
	var hours = new Date().getHours();
	var minutes = new Date().getMinutes();
	var seconds = new Date().getSeconds();
	var year = new Date().getFullYear();
	var month = new Date().getMonth() + 1;
	month = (month < 10 ? "0" : "") + month;
	var day = new Date().getDate();
	day = (day < 10 ? "0" : "") + day;
	if (hours < 10) hours = "0" + hours;
	if (minutes < 10) minutes = "0" + minutes;
	if (seconds < 10) seconds = "0" + seconds;
	return day + "." + month + "." + year + " " + hours + ":" + minutes + ":" + seconds;
}

//logging with timestap
function writeLog(message) {
	var hours = new Date().getHours();
	var minutes = new Date().getMinutes();
	var seconds = new Date().getSeconds();
	if (hours < 10) hours = "0" + hours;
	if (minutes < 10) minutes = "0" + minutes;
	if (seconds < 10) seconds = "0" + seconds;
	console.log(hours + ":" + minutes + ":" + seconds + " " + message);
}