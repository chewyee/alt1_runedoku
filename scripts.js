///<reference path="/alt1lib.js">
///<reference path="/runeappslib.js">
///<reference path="/imagedetect.js">
///<reference path="/apps/alt1/alt1doc.js">
"use strict";

var openbutton = null;
ImageData.fromBase64(function (i) { openbutton = i; }, "iVBORw0KGgoAAAANSUhEUgAAAEsAAAAOCAIAAADouXZiAAABAklEQVRIS+2QQZKCUBBDOYT7WXgCb+ttx0CYR+xGFFfq2JWy0i/5wHc4HQ+fre8NX0C/559Cduk9bjgM97/z1h/xUTdcrf2zG6pkPQHtC0w5yrSThHAZfzrEPjurxFpu6EzP0tDbBeFAlEc0hdAvNY2hDFGp5VkTjYl1dUMy/F6Y3gWrE0NECik1mex0nzC1oLvHEiKtG020SvQrqCkp0KtTVhOkVSk1OmhB2cBvQKakxT9CepowTUZMQvvUFVLJGoO/h3bYucn2y0o/ibTxOlJ7DDIBslr1O/Qsj1cdmPdpqEkzmgaSKR5N3XE60dwiht1PlXkyzXUkuXT5hgW+k46HC+74OGtHND2MAAAAAElFTkSuQmCC");

var runemap = null;
var runeimgs = null;
var puzzlepos = null;
var osrsmode = false;//osrs doesn't show a difference between the starting runes and the placed runes.

//debug globals
var groups = null;
var map = null;

function start() {
	a1lib.identifyUrl("appconfig.json");
	PasteInput.listen(function (img) {
		readpuzzle(new ImgRefCtx(img, new Rect(0, 0, img.width, img.height)));
	}, message);//TODO add error function
}

function clicksolve() {
	if (!window.alt1) { message("You need alt1 to use this feature, please paste a screenshot instead."); return; }
	var imgref = a1lib.bindfullrs();
	if (!imgref) { message("Error while trying to make a screenshot, please check if pixel permission is enabled."); return; }
	readpuzzle(imgref);
}

function readpuzzle(imgref) {
	qw("trying std button");
	var pos = a1lib.findsubimg(imgref, openbutton);
	if (pos.length == 0) {
		message("Can't find a runedoku puzzle in the image.");
		return;
	}
	puzzlepos = { x: pos[0].x + 103, y: pos[0].y - 55 };
	if (osrsmode) { puzzlepos.x -= 1; puzzlepos.y += 2; }
	var buf = imgref.toData(puzzlepos.x, puzzlepos.y, 350, 350);

	runeimgs = [];
	runemap = [];
	for (var i = 0; i < 9 * 9; i++) { runemap[i] = -1; }

	for (var x = 0; x < 9; x++) {
		for (var y = 0; y < 9; y++) {
			var i = x + y * 9;
			var rune = readRune(buf, x * 37, y * 37);
			runemap[i] = rune;
		}
	}

	if (runeimgs.length > 9) {
		message("Failed to read puzzle correctly. to many rune types");
		return;
	}
	if (runeimgs.length == 0) {
		message("OSRS mode enabled");
		osrsmode = true;
		readpuzzle(imgref);
		return;
	}

	dumprunes(runemap);
	solve(runemap);
}

function readRune(buf, x, y) {
	if (!osrsmode && buf.comparePixel(x + 2, y + 2, 68, 0, 0, 0) > 10) { return -1; }
	for (var a = 0; a < runeimgs.length; a++) {
		var locs = a1lib.findsubbuffer(buf, runeimgs[a], x, y, 32, 32);
		if (locs.length != 0) { return a; }
	}
	var runebuf = buf.clone(new Rect(x + 2, y + 2, 28, 28));
	var pxcount = 0;
	for (var x = 0; x < runebuf.width; x++) {
		for (var y = 0; y < runebuf.height; y++) {
			var i = y * runebuf.width * 4 + x * 4;
			var skip = false;
			skip = skip || runebuf.comparePixel(x, y, 68, 0, 0) <= 10;
			skip = skip || runebuf.comparePixel(x, y, 250, 153, 7) <= 10;
			skip = skip || runebuf.comparePixel(x, y, 233, 192, 1) <= 10;
			if (skip) { runebuf.setPixel(x, y, 0, 0, 0, 0); }
			else { pxcount++; }
		}
	}
	if (pxcount < 28 * 28 / 10) {
		return -1;
	}
	runeimgs.push(runebuf);
	return runeimgs.length - 1;
}

function solve(runemap) {
	var opts = new DigitMap();
	var groups = [];
	//rows
	for (var y = 0; y < 9; y++) {
		var slots = [];
		for (var x = 0; x < 9; x++) { slots.push(x + y * 9); }
		groups.push(new DigitGroup(slots, "row" + y));
	}
	//colums
	for (var x = 0; x < 9; x++) {
		var slots = [];
		for (var y = 0; y < 9; y++) { slots.push(x + y * 9); }
		groups.push(new DigitGroup(slots, "col" + x));
	}
	//cells
	for (var i = 0; i < 9; i++) {
		var slots = [];
		for (a = 0; a < 9; a++) { slots.push((3 * (i % 3) + a % 3) + (3 * Math.floor(i / 3) + Math.floor(a / 3)) * 9); }
		groups.push(new DigitGroup(slots, "cel" + i));
	}

	var map = new DigitMap();
	window.map = map;//TODO debug
	window.groups = groups;//TODO debug
	map.groups = groups;
	for (var a in groups) {
		groups[a].groups = groups;
		groups[a].map = map;
	}

	//=== enter known numbers ===
	for (var i = 0; i < 9 * 9; i++) {
		if (runemap[i] != -1) { map.setDigit(i, runemap[i]); }
	}

	//=== solving loop ===
	var printinvalidates = function () {
		var str = "invalidated items: ";
		if (map.invalidated) { str+="map "; }
		for (var b in groups) { if (groups[b].invalidated) { str += groups[b].name + " "; } }
		console.log(str);
	}
	var done = false;
	for (var a = 0; a < 1000; a++) {
		//printinvalidates();
		if (map.invalidated && map.findCertain()) { continue; }
		var found = false;
		for (var b in groups) { if (groups[b].invalidated && groups[b].findCertain()) { found = true; break; } }
		if (found) { continue;}
		done = true;
		break;
	}
	if (done) { qw("no more certain runes found"); }

	//=== output results ===
	var newrunemap = [];
	for (var i = 0; i < 9 * 9; i++) {
		newrunemap[i] = map.certain[i];
	}
	dumprunes(newrunemap);
	solutionInterface(newrunemap);
	return newrunemap;
}

function DigitGroup(slots,name) {
	this.map = null;
	this.groups = null;
	this.name = name;

	this.slots = slots;
	this.posloc = [];
	this.certain = [];
	this.invalidated = false;
	for (var a = 0; a < 9; a++) {
		this.posloc[a] = [];
		this.certain[a] = -1;
		for (var b = 0; b < 9; b++) {
			this.posloc[a][b] = this.slots[b];
		}
	}

	this.removeOpt = function (i, number) {
		if (this.slots.indexOf(i) == -1) { return; }
		var a = this.posloc[number].indexOf(i);
		if (a != -1) {
			this.posloc[number].splice(a, 1);
			this.invalidated = true;
		}
	}

	this.setDigit = function (i, number) {
		if (this.slots.indexOf(i) == -1) { return; }
		if (this.certain[number] != -1) { return; }

		this.certain[number] = i;
		this.posloc[number] = [i];
		this.invalidated = true;

		for (var a = 0; a < 9; a++) {
			if (a == number) { continue; }
			var b = this.posloc[a].indexOf(i);
			if (b != -1) { this.posloc[a].splice(b, 1); }
		}
		for (var a = 0; a < 9; a++) {
			var slot = this.slots[a];
			if (slot == i) { continue; }
			this.map.removeOpt(slot, number);
		}
	}

	this.findCertain = function () {
		for (var a = 0; a < 9; a++) {
			if (this.certain[a] == -1 && this.posloc[a].length == 1) {
				//qw("Found certain in group " + this.name + ". slot " + this.slots[a] + " is " + this.posloc[a][0]);
				//this.map.setDigit(this.slots[a], this.posloc[a][0]);
				qw("Found certain in group " + this.name + ". slot " + this.posloc[a][0] + " is " + a);
				this.map.setDigit(this.posloc[a][0], a);
				return true;
			}
		}
		this.invalidated = false;
		return false;
	}
}

function DigitMap() {
	this.groups = null;

	this.opts = [];
	this.certain = [];
	this.invalidated = false;
	for (var i = 0; i < 9 * 9; i++) {
		this.opts[i] = [];
		this.certain[i] = -1;
		for (var a = 0; a < 9; a++) { this.opts[i][a] = a; }
	}

	this.removeOpt = function (i, number) {
		var a = this.opts[i].indexOf(number);
		if (a != -1) {
			this.opts[i].splice(a, 1);
			for (var a in this.groups) { this.groups[a].removeOpt(i, number); }
			this.invalidated = true;
		}
	}

	this.setDigit = function (i, number) {
		if (this.certain[i] == -1) {
			this.certain[i] = number;
			this.opts[i] = [number];
			for (var a in this.groups) { this.groups[a].setDigit(i, number); }
			this.invalidated = true;
		}
	}

	this.findCertain = function () {
		for (var i = 0; i < 9 * 9; i++) {
			if (this.certain[i] == -1 && this.opts[i].length == 1) {
				qw("Found certain in map. slot " + i + " is " + this.opts[i][0]);
				this.setDigit(i, this.opts[i][0]);
				return true;
			}
		}
		this.invalidated = false;
		return false;
	}
}



function message(str) {
	elid("message").innerText = str;
}

function dumprunes(runemap) {
	var str = "";
	for (var y = 0; y < 9; y++) {
		for (var x = 0; x < 9; x++) {
			var rune = runemap[x + y * 9];
			str += (rune == -1 ? "--" : addspaces(rune, 2)) + " ";
		}
		str += "\n";
	}
	qw(str);
}

function dumpruneimgs() {
	for (var a in runeimgs) {
		var el = runeimgs[a].show();
		el.style.left = a * 40 + "px";
	}
}

function overlayrunes(runemap) {
	if (!puzzlepos) { message("Please click to the solve button to find the position of the puzzle"); }

	for (var y = 0; y < 9; y++) {
		for (var x = 0; x < 9; x++) {
			var rune = runemap[x + 9 * y];
			alt1.overLayText("" + rune, a1lib.mixcolor(255, 255, 255), 12, puzzlepos.x + 37 * x, puzzlepos.y + 37 * y, 1000);
		}
	}
}

var solutionInterval = null;
function solutionInterface(runemap) {
	var selectedrune = 0;
	var runeels = [];

	var overlaySingle = function () {
		alt1.overLaySetGroup("runeoverlay");
		for (var i = 0; i < runemap.length; i++) {
			if (runemap[i] == selectedrune) {
				var x = puzzlepos.x + 37 * (i % 9);
				var y = puzzlepos.y + 37 * Math.floor(i / 9);
				var w = 32;
				var h = 32;
				alt1.overLayRect(a1lib.mixcolor(255, 255, 255), x + 2, y + 2, w - 4, h - 4, 1100, 2);
				alt1.overLayRect(a1lib.mixcolor(1, 0, 0), x, y, w, h, 1100, 2);
			}
		}
	}

	var selectRune = function (rune) {
		selectedrune = rune;
		for (var a = 0; a < runeels.length ; a++) {
			toggleclass(runeels[a], "selected", a == rune);
			var els = elcl("runetype-" + a);
			for (var b = 0; b < els.length; b++) {
				toggleclass(els[b], "selected", a == rune);
			}
		}
		if (window.alt1) {
			alt1.overLayClearGroup("runeoverlay");
			cancelInterval();
			solutionInterval = setInterval(overlaySingle, 1000);
			overlaySingle();
		}
	}

	var cancelInterval = function () {
		alt1.overLayClearGroup("runeoverlay");
		if (solutionInterval) { clearInterval(solutionInterval); }
		solutionInterval = null;
	}

	function drawOutput() {
		var spacing = 30;
		var el = elfrag();
		for (var a = 0; a < runemap.length; a++) {
			if (runemap[a] == -1) { continue;}
			var img;
			if (!runeimgs[runemap[a]]) { img = eldiv({ style: "display:inline-block;" }, [eldiv("runefiller")]); }
			else { img = runeimgs[runemap[a]].toImage(); }
			img.style.left = (a % 9) * spacing + 1 + "px";
			img.style.top = Math.floor(a / 9) * spacing + 1 + "px";
			img.classList.add("resultrune");
			img.classList.add("runetype-" + runemap[a]);
			el.appendChild(img);
		}
		elput("result", el);
	}

	var frag = elfrag();
	for (var a = 0; a < 9; a++) {
		var el;
		if (runeimgs[a]) { el = runeimgs[a].toImage(); }
		else { el = eldiv({style:"display:inline-block;"},[eldiv("runefiller")]);}
		el.style.margin = "2px";
		runeels[a] = el;
		el.onclick = selectRune.b(a);
		frag.appendChild(el);
	}
	drawOutput();
	if (window.alt1) {
		frag.appendChild(eldiv({ onclick: cancelInterval, style: "outline:1px solid gray; cursor:pointer; display:inline-block;" }, ["Hide overlay"]));
	}
	frag.appendChild(eldiv(["Tip: you can press alt+1 to cycle to the next rune."]));
	elput("solution", frag);
	if (window.alt1) {
		alt1.events.alt1pressed = [function () { selectRune((selectedrune + 1) % 9); }];
	}
	message("Solution found");
	selectRune(0);
}


//====== debug functions =======
function getgroup(name) {
	for (var a in groups) {
		if (groups[a].name == name) { return groups[a];}
	}
}


