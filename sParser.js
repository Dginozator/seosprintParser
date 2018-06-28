const os 							= require('os');
const puppeteer 			= require('../node_modules/puppeteer');
const cloudscraper 		= require('cloudscraper');
var fs 								= require('fs');

const WEB_PANEL_URL = "http://cap.dginozator.com/output_tasks.php?token=";
const WEB_PANEL_TOKEN = "v4PztRwitO";

const DEBUG_MODE = true;

const FILE_IN   = "./data/in.txt";
const SERVICE_DATA = "./data/service_common.txt";
const FILE_LOG 	= "log_seosprint.txt";
const FILE_COOKIES = "cookies.json";

const TIMEOUT_STEP = 15;

//-------------//Main functions//----------------

var Go = [];

Go[0] = async function() {
	var result = 1;
	var instance = {};

	var service_data = await readFile (SERVICE_DATA, true);
	var account_data = await readFile (FILE_IN, true);

	instance = new Browser();
	await instance.init();

	var loginRes = await LoginSeosprint(account_data.ss_login, account_data.ss_pass, instance, FILE_COOKIES, null, null);
	while ( await captchaSeosprintHere(loginRes.page) ) {
		loginRes = await LoginSeosprint(account_data.ss_login, account_data.ss_pass, instance, FILE_COOKIES, null, loginRes.page);
	  await delay (TIMEOUT_STEP*1000);
	}

	var parsing_module = new SParsingModule(loginRes.page);

	await parsing_module.scan();

	saveSeosprintCookies (instance, FILE_COOKIES);

	return(result);
}

//----------//End - Main functions//-------------

//-----------------//Service//-------------------

/**
@class service
@brief Send request and get answer
@param  loc_http      url
        parse_on  0   without parsing
                  1   json to object
@return	Answer
        	-1  Error
*/
var get_json_v5 = async function (p_http, parse_on) {
	var result = "";

  // result = await request.get(p_http);

  try {
	  var res_promise = new Promise(function(resolve,reject){
	  	try {
				cloudscraper.get(p_http, function(err, response, body) {
		      if (err) {
				    reject('Bad answer from server, ' + p_http);
				  }
				  else {
			    	resolve(body);
				  }
				});
	  	}
	  	catch(e) {
	  		reject('Request fault, ' + p_http);
	  	}
	  });
	  result = await res_promise;

	  if (parse_on) {
	    try {
	      result = JSON.parse(result);
	    } catch (loc_error) {
	      result = -1;
	    }
	  }
	}
	catch(e) {
		console.log(e);
		result = -1;
	}

	return (result);
}

/**
@class  service
@brief  Get current date and time.
@param  -
@return result. day
                month
                year
*/
function GetCurrentDate_v2 () {
  var result = {
    seconds: 0,
    minutes: 0,
    hours: 0,
    day: 0,
    month: 0,
    year: 0
  }
  
  var currentTime = new Date();
  result.seconds = currentTime.getSeconds();
  result.minutes = currentTime.getMinutes();
  result.hours = currentTime.getHours();
  result.day = currentTime.getDate();
  result.month = currentTime.getMonth() + 1;
  result.year = currentTime.getFullYear();
  result.year -= (Math.floor(result.year/100)*100);
  
  return (result);
}

async function delay(ms) {
	var promise = new Promise ((resolve, reject) => {
		if (ms <= 0) {
			reject(-1);
		}
		var timer = setTimeout(()=>{
			resolve(1);
		}, ms);
	});
	await promise;
}

/**
@class	service_imacros
@brief	Define data type with array type
@param	p_ 									Checked variable
@return	Like as typeof output, except
					array 						Array type
*/
function realIsObj (p) {
	var result = "";

	if (typeof p === "object") {
		if (Array.isArray(p)) {
			result = "array";
		}
	}
	if (result !== "array") {
		result = typeof p;
	}
	
	return (result);
}

function esc2Uni(str) {
  var regExp = /\\?u([\d\w]{4})/gi;
  var escapedCodeTemp = str.replace(regExp, function (match, group) {
      return String.fromCharCode(parseInt(group, 16)); 
    });
  return  unescape(escapedCodeTemp);
}

// UTF-8 encode / decode by Johan Sundstrom
function encode_utf8( s )
{
  return unescape( encodeURIComponent( s ) );
}

function decode_utf8( s )
{
  return decodeURIComponent( escape( s ) );
}

/**
@class	service_imacros
@brief	Validate object in order to example
@param	p_example						Example structure
				p_obj								Checked object
@return	{
					status
						1								valid object
						-1							not valid
					text
						this 						Not valid property
				}
*/
function validate_data (p_example, p_obj) {
	var result = {
		status: 1,
		text: "this"
	};
	var prev_result = {
		status: 1,
		text: "this"
	};

	var par;

	if (typeof p_example === typeof p_obj) {
		if (realIsObj(p_example) === "object") {
			for (par in p_example) {
				if (typeof p_obj[par] === "undefined") {
					result.status = -1;
					result.text = result.text + "." + par;
					break;
				}
				else {
					prev_result = validate_data (p_example[par], p_obj[par]);
					if (prev_result.status === -1) {
						result.status = -1;
						result.text = prev_result.text.replace ("this", "this." + par);
						break;
					}
				}
			}
		}
		else {
			//result.status = 1
		}
	}
	else {
		result.status = -1;
		// result.text = "this";
	}

	return (result);
}

//--------------//End - Service//----------------

//-----------//Puppeteer wrapping//--------------

class Browser {
	constructor () {
		switch(os.platform()) {
			case "win32":
				this._browser = puppeteer.launch({headless: false});
			break;
			case "linux":
				this._browser = puppeteer.launch({headless: false, executablePath:'/usr/lib/chromium-browser/chromium-browser'});
			break;
			default:
				this.status = -1;
				throw "Unkwown OS";
			break;
		}
		this.viewport = {width: 1012, height: 837};
		this.timeout = 60*1000;
		this.nexttry = 30*60*1000; //30 minutes
		this.status = 0;

		this._trustPages = [];
		this._oldPages = [];
	}
	async init() {
		this._browser = await this._browser;
	}
	get browser () {
		return(this._browser);
	}
	async open(p_site, cookiesFile) {
		var aPages = await this.browser.pages();
		var last_num = aPages.length - 1;
		var empty_pages = ["chrome-search://local-ntp/local-ntp.html", "about:blank"];
		var page = aPages[last_num];
		var last_url = page.url();

		var empty_flag = checkEmptyPage(page);
		if (!empty_flag) {
			page = await this.browser.newPage();
		}
		page.setDefaultNavigationTimeout( this.timeout );
		await page.setViewport( this.viewport );
		if (!!cookiesFile) {
			cookiesToBrowser(page, cookiesFile);
		}
		if (!!p_site) {
			await page.goto(wrapper_http(p_site).full_url, {waitUntil: 'domcontentloaded'});
		}
		return(page);
	}
	async close () {
		await this.browser.close();
	}
	trustAdd (page) {
		this._trustPages.push ( page );
	}
	trustDelete (page) {
		var index = this._trustPages.indexOf(page);
		if (index !== -1) {
			this._trustPages.splice(index, 1);
		}
	}
	async trustOnly () {
		var pages = {};
		var len = 0;
		var trustLen = this._trustPages.length;
		var closeFlag = true;

		var a_promises = [];

		try {
			pages = await this.browser.pages();
			len = pages.length;

			for (var i = 0; i < len; i++) {
				closeFlag = true;
				for (var j = 0; j < trustLen; j++) {
					if (pages[i] === this._trustPages[j]) {
						closeFlag = false;
						break;
					}
				}
				if (closeFlag) {
					console.log("for test 712: close");
					a_promises.push ( pages[i].close() );
				}
			}

			len = a_promises.length;
			for (var i = 0; i < len; i++) {
				await a_promises[i];
			}
		}
		catch(e) {
			console.log("for test 1407");
			console.log(e);
		}
	}
	async getNewPages(restartFlag = true) {
		var newPages = await this.browser.pages();

		var result = newPages.filter(i => !this._oldPages.includes(i));

		if ( restartFlag ) {
			this._oldPages = newPages;
		}
		return (result);
	}
	promiseNewPage (timeout = 3000) {
		var newPagePromise = new Promise( (resolve, reject) => {
			this.browser.once ("targetcreated", (target) => {
				resolve( target.page() );
			});
			var timer = setTimeout( () => {
				reject(-1);
			}, timeout);
		} );

		return (newPagePromise);
	}
	selfLinksMode () {
		this.browser.on ("targetcreated", (target) => {
			console.log("new page");
			target.page().then( page => {
				if ( !!page ) {
					page.on ("domcontentloaded", () => {
						page.evaluate(() => {
							var all_a = document.querySelectorAll("a");
							var len = all_a.length;

							for (var i = 0; i < len; i++) {
								all_a[i].target = "_self";
							}
							console.log("all urls in one page");
						}, null);
					});
				}
			});
		});
	}
}

function checkEmptyPage (page) {
	var empty_pages = ["chrome-search://local-ntp/local-ntp.html", "about:blank"];
	var last_url = page.url();
	var empty_flag = false;
	for (var i = 0; i < empty_pages.length; i++) {
		if (last_url.indexOf(empty_pages[i]) !== -1) {
			empty_flag = true;
			break;
		}
	}
	return(empty_flag);
}

async function allLinksInOneTab (page) {
	await page.evaluate(() => {
		var all_a = document.querySelectorAll("a");
		var len = all_a.length;

		for (var i = 0; i < len; i++) {
			all_a[i].target = "_self";
		}
	}, null);
}

async function tagHere (page, selector, timeout_s = 1){
	var result = true;
	var findRes = page.waitForSelector(selector, {timeout: timeout_s*1000});

	try {
		findRes = await findRes;
	}
	catch(e) {
		result = false;
	}

	return(result);
}

async function tagHereXpath (page, xpath, timeout_s = 1){
	var result = true;
	var findRes = page.waitForXPath(xpath, {timeout: timeout_s*1000});

	try {
		findRes = await findRes;
	}
	catch(e) {
		result = false;
	}

	return(result);
}

async function xpathToCSS(page, xpath, timeout_s = 1) {
	var result = {
		status: 1,
		text: ""
	}

	var num = "p" + String(	Date.now() ) + getRandom(0, 1000000);

	var findRes = page.waitForXPath(xpath, {timeout: timeout_s*1000});

	try {
		findRes = await findRes;

		result.text = await page.evaluate ((l_elem, l_num) => {
			l_elem.style = 'border: 1px solid green;';
			if (!l_elem.id) {
				l_elem.id = l_num;
				l_num = '#' + l_num;
			}
			else {
				l_num = '#' + l_elem.id;
			}
			return l_num;
		}, findRes, num);
	}
	catch(e) {
		result.status = -1;
	}

	return(result);
}

async function fastClick (page, selector, maxTime_s = 2){
	var result = true;
	var delay_ms = RandomDeviation (maxTime_s*1000, 50);
	try {
		await page.waitForSelector(selector, {timeout: 5000});
		await delay(delay_ms);
		await page.click(selector);
	}
	catch(e) {
		// console.log(e);
		result = false;
	}
	return (result);
}

async function fastClickXpath (page, xpath, maxTime_s = 2){
	var result = true;
	var delay_ms = RandomDeviation (maxTime_s*1000, 50);
	var elem = {};
	try {
		elem = await page.waitForXPath(xpath, {timeout: 5000});
		await delay(delay_ms);

		await page.evaluate(l_elem => {
			l_elem.click();
		}, elem);
	}
	catch(e) {
		// console.log(e);
		result = false;
	}
	return (result);
}

async function tagSelect (page, selector, value, maxTime_s = 2) {
	var result = 1;
	var delay_ms = RandomDeviation (maxTime_s*1000, 50);
	try {
		await page.waitForSelector(selector, {timeout: 6000});
		await delay(delay_ms);
		await page.select(selector, String(value));
	}
	catch(e) {
		//
	}

	return (result);
}

/**
speed - symbols in minute.
	0 		input instantly
*/
async function inputText (page, selector, text, speed = 190, clearFlag = true) {
	const deviation = 38;

	var delay_ms = RandomDeviation (1400, 20);

	var status = 1;
	var len = 0;
	var char_time_ms = 0;
	var current_char_time_ms = 0;

	var test_ms = 0;

	var elem = {};

	text = String(text);

	try {
		len = text.length;
		char_time_ms = 60*1000/speed;

		elem = await page.waitForSelector(selector, {timeout: 6000});
		if (clearFlag) {
			await page.evaluate((elem) => {
				elem.value = "";
			}, elem)
		}
		await delay(delay_ms);
		await page.focus(selector);

		for (var i = 0; i < len; i++) {
			test_ms = Date.now();
			current_char_time_ms = RandomDeviation(char_time_ms, deviation);
			await page.keyboard.type(text[i]);
			await delay(current_char_time_ms - Date.now() + test_ms);
		}
	}
	catch(e){
		console.log(e);
		status = -1;
	}

	return(status);
}

/**
@class	puppeteer_wrapping
@brief	Extract text from tag. NOT WORKING
@param	page 								Puppeteer page
				selector 						CSS selector
				mode
					"TEXT"
					"HTML"
					"VALUE"
@return
	{
		status: 1, 							normal
			-1 										no elements
			-2 										wrong mode
			-3 										other error
			-4 										Not ended now
			-5 										undefined value
		text: "" 								Extracted text
	}
*/
async function getContent (page, selector, mode) {
	var result = {
		status: 1,
		text: ""
	}

	var arr_elem = await page.$$(selector);
	var elem = {};

	if (arr_elem.length < 1) {
		result.status = -1;
	}
	try {
		if (result.status > 0) {
			elem = arr_elem[0];
			if (mode === "TEXT") {
				result.text = await page.evaluate(l_elem => {
					return (l_elem.textContent)
				}, elem);
			} else if (mode === "HTML") {
				// result.text = elem.innerHTML;
				result.status = -4;
			} else if (mode === "VALUE") {
				result.text = await page.evaluate(l_elem => {
					return (l_elem.value)
				}, elem);
			}	else {
				result.status = -2;
			}
			if (!!result.text) {
				result.text = String(result.text);
			}
			else {
				result.text = "";
				result.status = -5;
			}
		}
	}
	catch(e) {
		result.status = -3;
		// result.status = e;
	}
	
	return(result);
}

async function saveCookies(page, urls, file) {
	var result = 1;
	var cookies = await page.cookies(urls);

	fs.writeFile(file, JSON.stringify(cookies), (err) => {
	  if (err) throw err;
	  console.log('Cookies has been saved!');
	});

	return(result);
}

async function cookiesToBrowser(page, file) {
	var loadedcookies = await loadCookies(file);
	if (loadedcookies.status === 1) {
		for (let par in loadedcookies.arr) {
			await page.setCookie(loadedcookies.arr[par]);
		}
	}
}

async function loadCookies(file){
	var result = {
		status: 1,
		arr: [],
		text: ""
	}

	var promise = new Promise(function(resolve,reject){
		fs.readFile(file, (err, data) => {
		  if (err) reject(err);
		  resolve(data);
		});
	}.bind(this));

	try {
		result.text = await promise;
		result.arr = JSON.parse(result.text);
	}
	catch(e) {
		result.status = -1;
	}
	return(result);
}

async function clonePage(instance, proto_page, doublePage = null) {
	var url = "";

	if (!doublePage) {
		doublePage = await instance.open();
	}

	try {
		url = proto_page.url();
		await doublePage.goto(url, {timeout:60000,waitUntil: 'domcontentloaded'});
	}
	catch(e) {
	}

	return(doublePage);
}

function addgetParam (url, key) {
	var result = url;
	if (result.indexOf("?") !== -1) {
		result += "&" + key;
	}
	else {
		result += "?" + key;
	}
	return (result);
}

//--------//End - Puppeteer wrapping//-----------

//---------------//Navigation//------------------

/**
@class  Navigation
@brief  Define domain and main page url
@param  p_site
@return domain              Domain
        main_url            Main page url
        full_url            Full source url
        no_p                No params
        www_f               www flag
          1                 www here
          -1                no www
*/
function wrapper_http (p_site) {
  var result = {
    domain: "",
    main_url: "",
    full_url: "",
    no_p: "",
    www_f: -1
  };
  var http_init = 'http://';
  var regexp_http = /^https?:\/\//;
  var regexp_main = /^https?:\/\/[^/]*/;
  var regexp_domain = /^\/*[^/]*/;
  var regexp_params = /\?.*/;
  var regexp_www = /^www\./;
  var l_site = p_site;

  if (p_site.search(regexp_http) === -1) {
    l_site = p_site.match (regexp_domain);
    l_site = l_site[0];
    result.domain = l_site.replace(/^\/*/, "");
    result.main_url = http_init + result.domain;
    result.full_url = result.main_url;
  }
  else {
    //
    result.full_url = p_site;
    l_site = p_site.match (regexp_main);
    result.main_url = l_site[0];
    l_site = l_site[0];
    l_site = l_site.replace(regexp_http, "");
    result.domain = l_site.replace(/\/*/, "");
  }
  result.no_p = result.full_url.replace(regexp_params, "");

  if (result.domain.search(regexp_www) !== -1) {
    result.www_f = 1;
    result.domain = result.domain.replace (regexp_www, "");
  }
  
  return (result);
}


/**
@class  Navigation
@brief  Add http in url.
@param  p_url               URL for changing
@return  new url
*/
function AddHTTP (p_url) {
  var abs_init = 'http://';
  var regexp_abs_init = /^https?:\/\//;
  var result = '';
  
  if (p_url.search(regexp_abs_init) === -1) {
    result = abs_init + p_url;
  }
  else {
    result = p_url;
  }

  return (result);
}

/**
@class  Navigation
@brief  Separate domain from url
@param  p_url               URL
@return  domain
*/
function DomainFromURL (p_url) {
  var result = '';
  var l_regexp = /^(https?:\/\/)?[^/]*/;
  var l_regexp_del = /^.*\//;
  var www_regexp_del = /w{3}\./;

  var regexp_domain = /\/?[^/]+/;

  result = p_url.match (l_regexp);

  if (result === null) {
    result = p_url.match (regexp_domain);
    result = result[0];
    result = result.replace(/\//, "");
  }
  else {
    result = result[0];
    result = result.replace (l_regexp_del, '');
    result = result.replace (www_regexp_del, '');
  }
  return (result);
}

/**
@class  Navigation
@brief  Search all href on page
@param  source          		HTML source
					page 							Instance page
					text 							HTML code
        p_mode              (reserved)
          1                 all pages
          0                 except p_page urls
@return  Array with all URLs in format 'href="url"'
*/
async function AllURL (source, p_mode = 1) {
  var error_flag = false;
  var html_code = '';
  var regexp_url = /href=(('[^']*')|("[^"]*"))/g;
  var regexp_del = [/(\.css|\.ico|\.jpg|\.png|\.xml)\S{0,3}$/,
  /(\.css|\.ico|\.jpg|\.png|\.xml)\?.*$/,
  /\/\?/,
  /javascript:/,
  /#/,
  /\/feed/,
  /\/xml/
  ];

  // http://info.siteads.ru/aleksey-panin-znaet-pochemu-maksim-gal/feed/
  // http://info.siteads.ru/xmlrpc.php

  var search_result = [];
  var l_length = 0;
  var reg_j = 0;
  var reg_len = regexp_del.length;
  var double_i = 0;

  if (typeof source === "string") {
  	html_code = source;
  }
  else {
  	try {
  		html_code = await source.content();
  	}
  	catch (e) {
  		error_flag = true;
  	}
  }

  if (!error_flag) {
	  search_result = html_code.match (regexp_url);

	  if (search_result !== null) {
	  	var l_len = search_result.length;
	  	for (var i = 0; i < l_len; i++) {
	  		search_result[i] = search_result[i].replace(/'/g, "\"");
	  		//delete doubles
	  		for (double_i = i+1; double_i < l_len; double_i++) {
	  			if (search_result[double_i] === search_result[i]) {
	  				search_result.splice (double_i, 1);
		  			double_i--;
		  			l_len--;
	  			}
	  		}

	  		for (reg_j = 0; reg_j < reg_len; reg_j++) {
	  			if (search_result[i].search(regexp_del[reg_j]) !== -1) {
		  			search_result.splice (i, 1);
		  			i--;
		  			l_len--;
		  			break;
		  		}
	  		}
	  	}
	  }
	  else {
	  	search_result = [];
	  }
	}

  return (search_result);
}

/**
	@return
		status: 1 					Normal
						-1 					Error
		pageType: 0, 				Page with article
		 					1 				Page with url to articles (much big-font urls). Reserved
		modiModule 					allUrlModifyModule object
			next()
			getLast()
		function isBig(fontSize)
												Function for definition size of url font. Not working!
		//
*/
async function allUrlModify (page, allurl) {
	const edge = 0.3;

	var result = {
		status: 1,
		modiModule: {},
		pageType: 0,
		next: ()=>{},
		getLast: ()=>{},
		isBig: function (){return false}
	};

	var obj = this;
	var len = allurl.length;

	var i = 0;
	var currentSize = 0;
	var sumOne = 0;
	var countOne = 0;
	var sumAll = 0;
	var averageOne = 0;
	var averageAll = 0;
	var koef = 1;

	var allSizes = [];
	var allsizesCount = 0;
	var edgeIndex = 0;
	var edgeVal = 0;

	result.modiModule = new allUrlModifyModule();

	for (i = 0; i < len; i++) {
		result.modiModule.add (allurl[i], getElemFontSize(page, allurl[i]) );
	}
	await result.modiModule.calc();

	result.next = ()=>{
		return(result.modiModule.next());
	};
	result.getLast = ()=>{
		return(result.modiModule.getLast());
	}

	return(result);
}

class allUrlModifyModule {
	constructor () {
		this.filterP = 70;
		this.pow = 3;

		this.status = 1;
		this.lotteryMax = 0;
		this.arr = [];
		this.lastItem = {};

		this.currentRange = 0;
	}
	add (allurlItem, fontSize) {
		this.status = 1;

		this.arr.push({
			txt: allurlItem,
			size: fontSize,
			lotteryRange: 0
		});
	}
	async calc () {
		var len = this.arr.length;

		for (var i = 0; i < len; i++) {
			this.arr[i].size = await this.arr[i].size;
		}

		this._sort();
	}
	_sort () {
		this.arr.sort((a,b)=>{
			if (a.size < b.size) {
				return (1);
			}
			else {
				return (-1);
			}
		});

		this._deleteLoneBiggest();
		this._hardFilter();
		this._recalcLottery();
	}
	_recalcLottery() {
		var len = this.arr.length;

		this.currentRange = 0;
		for (var i = 0; i < len; i++) {
			this.currentRange += Math.pow (this.arr[i].size, this.pow);
			this.arr[i].lotteryRange = this.currentRange;
		}
	}
	_deleteLoneBiggest() {
		if (this.arr.length > 1) {
			if (this.arr[0].size !== this.arr[1].size) {
				this.arr.splice(0, 1);
			}
		}
	}
	_hardFilter() {
		var currentSize = 0;
		var currentP = 0;
		var edgeIndex = 0;
		var oldEdgeIndex = 0;
		var len = this.arr.length;
		for (var i = len - 1; i >= 0; i--) {
			if (currentSize !== this.arr[i].size) {
				currentSize = this.arr[i].size;
				edgeIndex = i + 1;
				if (edgeIndex < len) {
					//check filtered size
					currentP = (len - edgeIndex)*100/len;
					if (currentP > this.filterP) {
						break;
					}
				}
				oldEdgeIndex = edgeIndex;
			}
		}
		if (oldEdgeIndex !== 0) {
			edgeIndex = oldEdgeIndex;
		}
		if (edgeIndex < len) {
			this.arr.splice(edgeIndex, len);
		}
	}
	next () {
		var result = null;
		var len = 0;

		if (this.status === 1) {
			len = this.arr.length;
			if (len < 1) {
				this.status = -1;
			}
			else {
				this.status = 1;
				this._lotteryPlay();
				this._recalcLottery();
				result = this.lastItem;
			}
		}
		return(result);
	}
	_lotteryPlay() {
		var len = this.arr.length;
		var i = 0;
		var luckyNumber = getRandom(0, this.currentRange);
		for (i = 0; i < len; i++) {
			if (luckyNumber <= this.arr[i].lotteryRange) {
				break;
			}
		}
		if (i === len) {
			i = len-1;
		}

		this.lastItem = this.arr[i];
		this.arr.splice(i, 1);
	}
	getLast () {
		return(this.lastItem);
	}
}

async function getElemFontSize(page, param) {
	var result = page.evaluate((href) => {
		var r = 0;
		var elem = document.querySelector("[" + href + "]");
		if (!!elem) {
			try {
				r = getComputedStyle(elem, null).fontSize;
				r = parseInt(r, 10);
			}
			catch(e) {
				r = 0;
			}
		}
		else {
			// r=0
		}
		return(r);
	}, param);

	return(result);
} 

/**
@class  Navigation
@brief  Divide 'text="url"' to param name and text.
@param  p_allurl            Text with view 'text="url"'
@return  {
            param: "text",  Parameter name
            text: "url"     Parameter value
            status
              1             success
              -1            error
          }
*/
function AllURL_div (p_allurl) {
  var result = {
    param: "",
    text: "",
    status: 1
  };

  var current = null;

  var regexp_param = /^[^=]+/;
  var regexp_text = /=(('[^']*\/[^']*')|("[^"]*\/[^"]*"))/g;

  try {
  	current = p_allurl.match (regexp_param);
  }
  catch(e) {
    current = null;
  }
  if (current === null) {
    result.status = -1;
  }

  if (result.status === 1) {
    result.param = current[0];
    current = p_allurl.match (regexp_text);
    if (current === null) {
      result.status = -1;
    }
  }

  if (result.status === 1) {
    result.text = current[0];
    result.text = result.text.replace (/["'=]/g, "");
  }
  
  return (result);
}

/**
@class  Navigation
@brief  Click link on page.
@param  page 						Puppeteer page
				p_allurl 				AllURL item or SiteWalker->pages structure
@return  {
					status: 1,
					url: "",
					page: page
				}
*/
async function clickLink (page, p_allurl = null) {
	const CparamFlag = {
		no: 0, 
		item: 1, 
		obj: 2
	}
	var paramFlag = CparamFlag.no;

	var result = {
		status: 1,
		url: "",
		page: page
	}

	var oldUrl = page.url();
	var test_url = "";
	var newUrl = oldUrl;
	var trueWaitFlag = false;
	var elem = {};

	try {
		await allLinksInOneTab (page);
	}
	catch(e) {
		result.status = -1;
	}

	if (result.status === 1) {
		result.status = -1;

		if (!p_allurl) {
			// paramFlag = CparamFlag.no;
		}
		else {
			if ( "string" === typeof p_allurl ) {
				paramFlag = CparamFlag.item;
			}
			else {
				paramFlag = CparamFlag.obj;
			}
		}

		if (paramFlag === CparamFlag.item) {
			elem = await page.$("[" + p_allurl + "]");
			if (!!elem) {
				trueWaitFlag = await trueWaitNavigation(page, async () => {
					await elem.click();
				});
				newUrl = page.url();
				if (newUrl !== oldUrl) {
					result.status = 1;
					result.url = newUrl;
				}
			}
			else {
				result.status = -1;
			}
		}
		else {
			try {
				let l_allurl = await AllURL (page);
				let len = l_allurl.length;

				shuffle(l_allurl);
				for (var i = 0; i < len; i++) {
					if ( !( OwnURL(l_allurl[i], oldUrl) ) ) {
						continue;
					}

					if (paramFlag === CparamFlag.obj) {
						test_url = RelativeToAbsolute(AllURL_div(l_allurl[i]).text, oldUrl);
						if ( p_allurl.hasOwnProperty( test_url ) ) {
							if ( p_allurl[test_url].hasOwnProperty("nextpages") ) {
								continue;
							}	
						}
					}

					elem = await page.$("[" + l_allurl[i] + "]");

					await allLinksInOneTab (page);
					trueWaitFlag = await trueWaitNavigation(page, async () => {
						await elem.click();
					});
					newUrl = page.url();
					if (newUrl !== oldUrl) {
						result.status = 1;
						result.url = newUrl;
						break;
					}
				}
			}
			catch(e){
				// result.status = -1;
				console.log(e);
			}
		}
	}

	return(result);
}

async function asyncClickLinkResBox (page) {
	return {
		status: 1,
		url: "",
		page: page
	};
}

async function trueWaitNavigation (page, afunc) {
	var delay_ms = 3000;
	var timeout = 30000;

	var result = false;

	var waitPromise = page.waitForNavigation({timeout: timeout, waitUntil: 'domcontentloaded'});

	try {
		await afunc();
		await delay (delay_ms);
		
		if ( (await getReadyState(page)) !== "complete" ) {
			await waitPromise;
			result = true;
		}
	}
	catch(e) {
		// console.log("for test 902");
		// console.log(e);
	}

	return(result);
}

async function getReadyState (page) {
	var result = -1;

	try {
		result = await page.evaluate (() => {
			return (document.readyState);
		}, null);
		// console.log("for test 1013: " + result);
	}
	catch(e) {
		result = "loading";
		// console.log("for test 1014: " + e);
	}

	return(result);
}

/**
@class  Navigation
@brief  Convert relative url to absolute.
@param  p_rel               Relative url
        p_page              initial page
@return  Absolute url after converting
*/
function RelativeToAbsolute (p_rel, p_page) {
  var result = '';
  var abs_init = 'http://';
  var regexp_abs_init = /^https?:\/\//;

  var regexp_params = /\?.*$/;
  var doc_name_delete = /\/[^/.]+\.[^/.]+$/;
  var regexp_doc_name = /\/[^/]+/g;
  var docs = 0;
  var wrap_page = new Object();

  var counter = 0;
  var j = 0;

  if (isAbsolutePath (p_rel)) {
    result = p_rel;
  }
  else {
  	p_page = AddHTTP (p_page);

	  wrap_page = wrapper_http(p_page);
    if (!isAbsolutePath(p_page)) {
      p_page = abs_init + p_page;
    }
    p_page = p_page.replace (regexp_params, "");

    docs = p_page.match(regexp_doc_name);
    if (docs !== null) {
    	if (docs.length > 1) {
    		p_page = p_page.replace (doc_name_delete, "/");
    	}
    	if (p_page.search(/\/$/) === -1) {
    		p_page = p_page + "/";
    	}
    }

    if (p_rel.search (/^\.\./) !== -1) {
    	//1. different folders - target upper
    	// <a href="../Ссылаемый документ.html">Ссылка</a>
    	do {
    		p_rel = p_rel.replace(/^\.\.\//, "");
    		counter++;
    	} while (p_rel.search (/^\.\./) !== -1);

    	docs = p_page.match(regexp_doc_name);
    	if (docs !== null) {
    		if (counter > (docs.length - 1)) {
    			counter = docs.length - 1;
    		}
    	}

    	for (j = 0; j < counter; j++) {
    		p_page = p_page.replace(/[^/]+\/?$/, "");
    	}
    	result = p_page + p_rel;
    }
    else if (p_rel.search (/^\//) !== -1) {
    	//2. Relative path to main folder
    	// <a href="/course/">Курсы</a>
    	result = abs_init + wrap_page.domain + p_rel;
    }
    else if (p_rel.search (/^(.+\/)*.+\.?.*$/) !== -1) {
    	//3. same folders
    	// <a href="Ссылаемый документ.html">Ссылка</a>
    	//4. different folders - target deeper
    	// <a href="Папка/Ссылаемый документ.html">Ссылка</a>
    	result = p_page + p_rel;
    }
    else {
    	result = p_rel;
    }
  }

  return (result);
}

/**
@class	Navigation
@brief	Get end of link
@param	p_url 							Full URL
@return	End of link
*/
function relURL (p_url) {
	var result = "";
	var reg_end = /[^/]+\/?$/;
	try {
		result = p_url.match(reg_end)[0];
	}
	catch (e) {
		result = p_url;
	}
	
	return (result);
}

/**
@class  Navigation
@brief  Define own url.
@param  p_url               Tested URL
        p_current_url       Current URL
@return  true               Own url
         false             	Foreign url 
*/
function OwnURL (p_url, p_current_url) {
  var result = false;

  var current_domain = (wrapper_http (p_current_url)).domain;

  if (current_domain !== -1) {
    if (isAbsolutePath (p_url)) {
      if (p_url.search (current_domain) !== -1) {
        result = true;
      }
    }
    else {
      result = true;
    }
  }
  
  return (result);
}

/**
@class	Navigation
@brief	Relative or absolute path check
@param	p_url 							URL
@return	true 								Is absolute path
				false 							Is relative path
*/
function isAbsolutePath (p_url) {
	var regexp_abs_init = /(https?:)?\/\//;
	var result = false;

	if (p_url.search(regexp_abs_init) !== -1) {
		result = true;
	}

	return (result);
}

/**
@class	Navigation
@brief	Biggest often class
@param	-
@return	Class name
*/
async function BiggestOftenClass (page) {
	var result = "";
	var size_max = 0;
	var l_rarity_classes = await veryOftenClasses (page);
	var len = l_rarity_classes.length;

	for (var i = 0; i < len; i++) {
		if (l_rarity_classes[i].size > size_max) {
			size_max = l_rarity_classes[i].size;
			result = l_rarity_classes[i].class_name;
		}
	}
	
	return (result);
}

/**
@class	Navigation
@brief	Define most often class.
@param	page 								Puppeteer page
@return	Array 							Classes from often to rare
				[], length=0 				No classes on page
				item
				{
					class_name: "", 	Class name 
					times: 0, 				Times at the page
					size: 0, 					For saving average tag size
					points: 0, 				Result points
				}
*/
async function veryOftenClasses (page) {
	var result = [];
	var search_result = null;
	var len = 0;
	var max = {
		value: 0,
		class: ''
	};
	var edge = 3;
	var item = function (p_class, p_times) {
		this.class_name = p_class;
		this.times = p_times;
		this.size = 0;
		// this.points = 0;
	}
	var i = 0;
	var html_code = '';
	var regexp_url = /class\s?=\s?(('[^']*')|("[^"]*"))/g;
	var regexp_class_name = /(('[^']*')|("[^"]*"))/;

	var classes = new Object();
	var test_txt = "";

  html_code = await page.content();
  search_result = html_code.match (regexp_url);

  if (search_result !== null) {
		len = search_result.length;
		for (i = 0; i < len; i++) {
			search_result[i] = search_result[i].match(regexp_class_name)[0];
			search_result[i] = search_result[i].replace (/["']/g, "");
			if (classes.hasOwnProperty(search_result[i])) {
				classes[search_result[i]]++;
			}
			else {
				classes[search_result[i]] = 1;
			}
		}

		var cur = "";
		for (cur in classes) {
			if (classes[cur] > max.value) {
	  		max.value = classes[cur];
	  		max.class = cur;
	  	}
		}

		for (cur in classes) {
	  	len = result.length;
	  	if (classes[cur] > edge) {
	  		for (i = 0; i <= len; i++) {
		  		if (i === len) {
		  			result.push(new item (cur, classes[cur]));
		  		}
		  		if (result[i].times < classes[cur]) {
		  			result.splice (i, 0, new item (cur, classes[cur]));
		  			break;
		  		}
		  	}
	  	}
	  }
  }

  len = result.length;
  for (i = 0; i < len; i++) {
  	result[i].size = await avgSizeClass (page, result[i].class_name);
  }

	return (result);
}

/**
@class	Navigation
@brief	Calculate average tag size with the same class
@param	page 								Puppeteer page
				p_class 						Class name
				p_mode 							Mode
					"textContent" 			Define size like a length of textContent
					"Area" 						Define size like a square of tag
@return	Average num of chars
				-1 									No elements with the class
*/
async function avgSizeClass (page, p_class, mode = "textContent") {
	var avg = 0;

	try {
		if (mode === "textContent") {
			avg = await page.evaluate((p_class)=>{
				var elems = document.querySelectorAll ("[class='" + p_class + "']");
				var len = elems.length;
				var avg = 0;
				var sum = 0;
				for (var i = 0; i < len; i++) {
					sum += elems[i].textContent.length;
				}
				if (len > 0) {
					avg = sum/len;
				}
				else {
					avg = -1;
				}
				return (avg);
			}, p_class);
		}
		else {
			//
		}
	}
	catch(e) {
		avg = -1;
		console.log("for test 656");
		console.log(e);
	}

	return (avg);
}

/**
@class  Navigation
@brief  Extract all tags with the class
@param  p_class             Class name
@return Joined tags with the class
*/
async function getAllClassTags (page, p_class) {

  var result = await page.evaluate( (p_class)=> {
  	var elems = document.getElementsByClassName(p_class);
  	var len = elems.length;
  	var r = "";

  	for (var i = 0; i < len; i++) {
	    r += elems[i].innerHTML;
	  }
	  return(r);
  }, p_class);
  
  return (result);
}

//------------//End - Navigation//---------------

//----------------//Seosprint//------------------

/**
@class  seosprint
@brief  Convert additional parameters from string to object.
@param  
@return  1                  Success
        -1                  Error
*/
function additionalToJSON (p_task_data) {
	var result = 1;
  
  if (p_task_data.hasOwnProperty("additional_task")) {
    //
    if ((typeof p_task_data.additional_task) == "string") {
      //
      p_task_data.additional_task = JSON.parse(p_task_data.additional_task);
    }
    else {
      result = -1;
    }
  }
  else {
    result = -1;
  }
  return (result);
}

/**
@class  seosprint
@brief  Seosprint login actions
@param  p_login             Seosprint login
        p_pass              Seosprint password
        p_instance 					Puppeteer browser
        p_rucaptcha_module  rucaptcha module for recaptcha recognizing
@return  
*/
async function LoginSeosprint (p_login, p_pass, p_instance, p_cookiesFile, p_rucaptcha_module, p_page) {
  var result = {
  	status: 1,
  	page: {}
  };
  var loginCheck = false;
  var login_input = "";
  
  try {
	  if (!p_instance) {
	  	throw ("LoginSeosprint: bad page control");
	  }

	  var page = {};

	  if (!!p_page) {
	  	page = p_page;
	  }
	  else {
	  	page = await p_instance.open("seosprint.net", p_cookiesFile);
	  	await fastClick(page, 'span.btnlogin');
	  }
	  result.page = page;

	  loginCheck = await LoginSeosprintCheck(page);

	  if ( !loginCheck ) {
	  	login_input = await getContent(page, 'input[type="text"]', "VALUE");

		  if ( !(login_input.text) ) {
		  	await inputText(page, 'input[type="text"]', p_login, 480);
		  	await inputText(page, 'input[type="password"]', p_pass, 480);
		  	await fastClick(page, 'span#show-5char', 2);
		  }

		  if (!!p_rucaptcha_module) {
		    p_rucaptcha_module.streamGo ();
		  }
	  }
	}
	catch(e) {
		console.log("for test 1350: " + e);
		result.status = -1;
	}
  return (result);
}

async function LoginSeosprintCheck (page) {
	var result = false;
	try {
		result = await tagHere (page, "a.logout");
	}
	catch(e) {
		//
	}
	return(result);
}

async function saveSeosprintCookies (instance, file) {
	arrPages = await instance.browser.pages();
	saveCookies(arrPages[0], "http://www.seosprint.net/", file);
}

async function captchaSeosprintHere (page) {
	var result = await tagHere (page, 'div#show-5char-block');
	return(result);
}

/**
@class	seosprint
@brief	Trap for apples
@param	-
@return	true 								Apple was trapped
				false 							No apple
*/
async function appleTrap (page) {
	var result = true;
	try {
		await fastClick(page, "span#icratpluc");
	}
	catch(e) {
		result = false;
	};
	return (result);
}

/**
@class	seosprint
@brief	fillProfile
@param	
@return	1 									Success
				-1 									Error
*/
async function fillProfile (page, p_ya_m, pin) {
	var result = 1;
	var passer_css = 'div.nameblock>a[href="/profile.php"]';
	var yam_num_res = {};

	if ( await tagHere(page, passer_css) ) {
		await fastClick(page, passer_css);
		if (page.url() !== "http://www.seosprint.net/profile.php") {
			await fastClick(page, passer_css);
		}
		try {
			yam_num_res = await getContent(loginRes.page, 'input[name="ask_yandex"]', "VALUE");
			console.log( yam_num_res.text === account_data.yam_num );
			if (yam_num_res.text == "" && yam_num_res.status === 1) {
				await tagSelect(page, 'form[name="personal"] select[name="ask_proff"]', getRandom (3, 6));
				await tagSelect(page, 'select[name="ask_family"]', getRandom (1, 6)),
				await tagSelect( page, 'select[name="ask_sex"]', getRandom (1, 1) );
				await tagSelect( page, 'select[name="ask_bday"]', getRandom (1984, 1996) );
				await inputText( page, 'input[name="ask_yandex"]', p_ya_m);
				await inputPIN (page, pin);
			}
		}
		catch(e) {
			result = -1;
		}
	}
	
	return (result);
}

/**
@class	seosprint
@brief	Input pincode
@param	page 								Puppeteer page
				p_val 							Pincode
@return	1 									Success
				-1 									Error
*/
async function inputPIN (page, p_val) {
	var result = 1;
	var pinblock = "div#pinblock";
	var fButtonXpath = "";
	
	p_val = String(p_val);
	var string_len = p_val.length;
	
	try {
		await fastClick(page, "span.btnpinclear");

		if ( await tagHere(page, pinblock) ) {
			for (var i = 0; i < string_len; i++) {
				fButtonXpath = "//div[@id='pinblock']/descendant::span[contains(.,'" + p_val[i] + "')]";
				await fastClickXpath(page, fButtonXpath, 1);
			}
			await fastClick(page, "span.button-green-big");
		}
	}
	catch(e){
		console.log(e);
		result = -1;
	}
	
	return (result);
}

/**
@class	seosprint
@brief	Get current balance and delta balance for session
@param	p_without_delta 		Result without delta
@return	{
					balance: 2000,
					delta(),
					status
						1 							Normal
						-1							No tag
						-2 							Other error
				}
*/
async function get_sBalance (page, p_without_delta = false) {
	var result = {
		balance: 2000,
		delta: function() {
			//
		},
		status: 1
	};
	var bal = 2000;

	var balanceSelector = "div.balance-block";
	while ( !(await tagHere (page, balanceSelector)) ) {
		if (result.status === 1) {
			result.status = 0;
			await page.goto("http://seosprint.net");
		}
		else {
			result.status = -1;
			break;
		}
	}

	if (result.status !== -1) {
		result.status = 1;
		bal = await getContent (page, "div.balance-block", "TEXT");
		bal = bal.text;
		try {
			bal = +bal.match(/\d+\.\d+/)[0];
			result.balance = bal;
			if (!p_without_delta) {
				result.delta = async function () {
					var r = await get_sBalance(page, true);
					return ({
						s: r.status,
						d: Math.round(100*(r.balance - result.balance))/100
					})
				}
			}
		}
		catch(e) {
			console.log(e);
			result.status = -2;
		}
	}
	return (result);
}

/**
@class	seosprint
@brief	Read news
@param	-
@return	1 									Normal
				-1 									Error
*/
async function readNews (page) {
	var result = 1;

	while ( !( await fastClick(page, 'a[href="/news.php"]') ) ) {
		if (result === 1) {
			result = 0;
			await page.goto("http://www.seosprint.net/index.php");
		}
		else {
			result = -1;
		}
	};
	if (result !== -1) {
		await delay(getRandom(13,25)*1000);
	}
	
	return (result);
}

async function ToTaskPage(page, p_tasknum) {
	var result = 1;
	var empty_listFlag = true;

	if (isNaN (+p_tasknum)) {
    result = -1;
  }

  if (result === 1) {
	  try {
	  	await page.goto("http://www.seosprint.net/index.php");
	  	await fastClick(page, "a[href='/work-task.php']");
	  	await fastClick(page, "span#tsk_mnu3");

	  	await inputText(page, "input[name='tasknum']", p_tasknum);
	  	await fastClick(page, "input.btnsearch");

	  	empty_listFlag = await tagHere(page, "span.advertise-empty");

	  	if ( empty_listFlag ) {
	  		result = -2;
	  	}
	  	else {
	  		await allLinksInOneTab(page);
	  		let l_css = await xpathToCSS(page, "//table[@class='work-serf']/descendant::tr[1]/descendant::a[contains(@href, 'work-task-read.php')]");
	  		if (l_css.status === 1) {
	  			await fastClick(page, l_css.text);
	  		}
	  		else {
					result = -3;
	  		}
	  	}
	  }
	  catch(e) {
	  	result = -4;
	  }
	}

	return(result);
}

/**
@class  seosprint
@brief  Check task status
@param  page 								Puppeteer page
@return  1                  Task is executable
        -1                  Task is not executable
*/
async function isExecutableTask (page) {
	var resObj = {
		status: 1,
		page: {}
	}

	try {
		resObj.page = page;

		await savePage(page);
		
		if ( await tagHere(page, 'form[action="/gotask.php"]') ) {
			// result = 1;
		}
		else if ( await tagHere(page, 'form[name="taskreportform"]') ) {
			// result = 1;
		}
		else {
			resObj.page = {};
			resObj.status = -2;
		}
	}
	catch(e) {
		resObj.status = -3;
	}

	return(resObj);
}

/**
@class  seosprint
@brief  Start task.
@param  -
@return true               	Success
				false              	Error
*/
async function DoTask(page) {
	return( await fastClick (page, 'span[onclick*="gotask"]') );
}

class DoClicks {
	constructor (instance, task_data) {
		var valid_res = null;

		this.instance = instance;
		this.page = null;

		this.task_data = task_data;
		this.status = 1;
		this.result = {
	    status: 1,
	    text: ''
	  };
		this.walker_report = {
	    site: [],
	    ad: [],
	    status: 1
	  };
	  this.walker_report_txt = "";
	  this.search = {
	  	query: "",
	  	url: ""
	  }
	  this.search_mode = this.C_SEARCH_MODE.SEARCH_URL;

	  valid_res = this.validate(task_data);

	  if (valid_res.status === -1) {
	  	this.result = this.C_RESULT.NOT_VALID_INPUT_PROP;
	  	this.result.text = this.result.text + ": " + valid_res.text;
	  }
	}
	async act () {
		var search_data;
		var l_len = 0;
		var iter = 0;

		var wlk = null;

		var search_res = {
			status: 0,
			query: "",
			search_url: ""
		};

		var l_site = this.task_data.additional_task.site_domain;
		var lSiteWr = null;
		var l_ads_url = "";
		var clicks = 0;
		var ads_clicks = 0;
		var test_txt = "";

		try {

			if (this.result.status === 1) {
				//input validation
			  //domain here?
			  if (!l_site) {
			  	this.result = this.C_RESULT.NO_DOMAIN;
			  }
			  else {
			  	lSiteWr = wrapper_http(l_site);
			  }
			}

			//ads example
			if (this.result.status === 1) {
				if (this.task_data.additional_task.max_ads_clicks > 0) {
		  		if (!this.task_data.additional_task.ads_url) {
		  			this.result = this.C_RESULT.NO_ADS_URL;
		  		}
		  	}
			}

			console.log ("for test 614");

			//delete empty strings
			if (this.task_data.additional_task.search_url[0] === "") {
				this.task_data.additional_task.search_url.splice(0, 1);
			}
			if (this.task_data.additional_task.search_queries[0] === "") {
				this.task_data.additional_task.search_queries.splice(0, 1);
			}

			//query or search_url
		  if (this.task_data.additional_task.search_url.length > 0) {
		  	this.search_mode = this.C_SEARCH_MODE.SEARCH_URL;
		  	search_data = this.task_data.additional_task.search_url;
		  }
		  else {
		  	if (this.task_data.additional_task.search_queries.length > 0) {
		  		this.search_mode = this.C_SEARCH_MODE.SEARCH_QUERIES;
		  		search_data = this.task_data.additional_task.search_queries;
		  	}
		  	else {
		  		//no searches
		  		this.search_mode = this.C_SEARCH_MODE.NO_SEARCH;
		  	}
		  }

		  console.log ("for test 644");

		  if (this.result.status === 1) {
		  	if (typeof(search_data) !== "undefined") {
		  		//search
		  		search_data = shuffle(search_data);
		  		l_len = search_data.length;

		  		console.log ("for test 2124");

		  		this.page = await this.instance.open();

		  		for (iter = 0; iter < l_len; iter++) {
		  			if (search_data[iter] === "") {
		  				continue;
		  			}
		  			console.log	("for test 2128: " + iter + "; " + l_len);

		  			search_res = await search_wrapper (this.page, this.task_data.additional_task.search_engine[0], search_data[iter], lSiteWr.domain);
		  			console.log ("for test 2134: '" + lSiteWr.domain + "'");
		  			console.log (search_res);
		  			if (search_res.status === 1) {
		  				this.search.query = search_res.query;
		  				this.search.url = search_res.search_url;
		  				break;
		  			}
		  		}

		  		console.log ("for test 2125");

		  		if (search_res.status !== 1) {
		  			if (this.search_mode === this.C_SEARCH_MODE.SEARCH_URL) {
		  				this.search.url = this.task_data.additional_task.search_url[0];
		  			}
		  			else if (this.search_mode === this.C_SEARCH_MODE.SEARCH_QUERIES) {
		  				this.search.url = this.task_data.additional_task.search_queries[0];
		  			}
		  		}

		  		this.result.text = this.search.query + "\n";
	  			this.result.text += this.search.url + "\n";
		  	}

		  	console.log("for test 743");

		  	if (search_res.status !== 1) {
		  		//after search error - direct transition
		  		//in SiteWalker module
		  	}

			  l_ads_url = this.task_data.additional_task.ads_url[0];
			  clicks = getRandom (this.task_data.additional_task.min_clicks, this.task_data.additional_task.max_clicks);
			  ads_clicks = getRandom (this.task_data.additional_task.min_ads_clicks, this.task_data.additional_task.max_ads_clicks);

			  test_txt = "";
			  for (var par in this.task_data.additional_task) {
			    test_txt += par + ", " + typeof this.task_data.additional_task[par] + ": " + String(this.task_data.additional_task[par]).substr(0, 20) + "\n";
			  }
			  console.log("for test 756:\n" + test_txt);

				wlk = new SiteWalker (this.instance, l_site, 4);
				// this.walker_report
		  }
		}
		catch(e) {
	  	console.log("for test 800");
	  	console.log(e);
	  }

		return(this.walker_report);
	}
	get report() {
		return(this.walker_report);
	}
	validate() {
		return (validate_data(this.common.data_example, this.task_data));
	}
}

DoClicks.prototype.C_RESULT = {
	//SUCCESS:{status: 1, text: "Success"},
	INPUT_WRONG_STRUCT: {status: -1, text: "Wrong input format"},
	NO_DOMAIN:{status: -2, text: "Domain is absent"},
	NO_ADS_URL:{status: -3, text: "Incorrect ads URL"},
	EMPTY_QUERIES:{status: -4, text: "Empty queries"},
	NOT_VALID_INPUT_PROP: {status: -5, text: "Not valid input"}
};

//search modes
DoClicks.prototype.C_SEARCH_MODE = {
	SEARCH_URL: 0,
	SEARCH_QUERIES: 1,
	NO_SEARCH: 2
}

//common parameters
DoClicks.prototype.common = {
	data_example: {
		"id_task":"1454655",
		"type_task":"clicks",
		"url_task":"http:",
		"reusable_task_flag":"0",
		"answer_task":"",
		"additional_task": {
			"search_queries":[""],
			"search_engine":["ya"],
			"search_url":["https://yandex.ru/search/?lr=10335&msid=1489911834.00606.20939.24381&text=%D0%B2%D1%8B%D0%BF%D1%83%D1%81%D0%BA%D0%BD%D0%BE%D0%B5+%D1%81%D0%BE%D1%87%D0%B8%D0%BD%D0%B5%D0%BD%D0%B8%D0%B5","https://yandex.ru/search/?text=%D1%81%D0%BE%D1%87%D0%B8%D0%BD%D0%B5%D0%BD%D0%B8%D0%B5%20%D0%B5%D0%B3%D1%8D%202017%20%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9%20%D1%8F%D0%B7%D1%8B%D0%BA%20%D0%BA%D0%BB%D0%B8%D1%88%D0%B5&lr=10335","https://yandex.ru/search/?text=%D0%BE%D1%82%D0%B2%D0%B5%D1%82%D1%8B%20%D1%86%D1%8B%D0%B1%D1%83%D0%BB%D1%8C%D0%BA%D0%BE%202017&lr=10335"],
			"site_domain":"vopvet.ru",
			"min_clicks":"2",
			"max_clicks":"3",
			"min_ads_clicks":"1",
			"max_ads_clicks":"2",
			"ads_url":["https://www.vemzu.cz/?gclid=CMWIvPmS4tICFU_PsgodCj4BgA"],
			"ip_flag":0
		}
	}
};

class SiteWalker {
	constructor (instance, p_site, navigation_count, p_ad_url) {
		this._delay_range = [40, 60];
		this.SIZE = {
			ERROR_NOSITE: -1,
			DEFAULT: 0,
			LITTLE_SITE: 1,
			NORMAL_SITE: 2
		}

		this.S = {
			SUCCESS:{num: 1, text: "Success"},
			WRONG_INSTANCE: {num: -1, text: "Wrong instance"},
			WRONG_PAGE: {num: -2, text: "Wrong page"}
		}
		this.maxPages_async = 4;

		this.status = this.S.SUCCESS;

		this.instance = {};
		if (!!instance) {
			this.instance = instance;
		}
		this.page = {};

		this.report = {
	    site: [],
	    with_ads_page: "",
	    status: 1
	  };

		// {
		// 	domain: "",
		// 	main_url: "",
		// 	full_url: ""
		// };
		this.site = wrapper_http(p_site);
		this.site_size = this.SIZE.DEFAULT;
		this.navi_count = navigation_count;
		this.startPagesCount = 4;
		this.multi = 3;

		this.p_ad_url = "";
		if (!!p_ad_url) {
	  	this.p_ad_url = p_ad_url;
	  }

	  // {
		// 	nextpages: pages array
		// 	cost: 1024
		// }
	  this.pages = {};
	  this.modify = null;
	  //unique all above edge
	  this.edgeCost = 0;

	  this.url_history = [];
	  this.current_url = "";
	  this.historyRepeats_flag = false;
	  this.contentClass = "";

	  this.timepoint = (new Date()).getTime();

	  this.goodurl_scope = [];
	}
	_boolStatus () {
		var result = true;
		if (this.status.num !== 1) {
			result = false;
		}
		return (result);
	}
	set setInstance (instance) {
		this.instance = instance;
	}
	async init () {
		try {
			this.page = await this.instance.open();
		}
		catch (e) {
			this.status = this.S.WRONG_INSTANCE;
		}
	}
	async deinit () {
		await this.page.close();
	}
	async gosite () {
		var wr_current = this.wrUrl();
		if (wr_current.domain !== this.site.domain) {
			try {
				await this.page.goto (this.site.main_url, {timeout:60000, waitUntil: 'domcontentloaded'});
			}
			catch(e) {
				//
			}
			await this._actualURL();
		}
	}
	async gopage(url) {
		var wr_url = {};

		if (!!url) {
			wr_url = wrapper_http (url);
		}
		else {
			wr_url = this.site;
		}

		if (this.wrUrl().full_url !== wr_url.full_url) {
			try {
				await this.page.goto (wr_url.full_url);
			}
			catch (e) {
				//
			}
			await this._actualURL();
		}
	}
	wrUrl () {
		return ( wrapper_http (this.page.url()) );
	}
	/**
	@class  Navigation
	@brief  Define site size.
	@param  -
	@return 1                   Little site
	        2                   Normal site
	        -1                  Error
	*/
	async defineSize (){
		// this.site_size
		// this.navi_count
		try {
			await this.gosite();
			await this.defineContentClass();
		}
		catch(e) {
			//
		}
		
		if (this.maxPages_async > this.navi_count) {
			this.maxPages_async = this.navi_count;
		}

		var remain = this.startPagesCount;
		var promise_res = {};
		var test_current = 0;

		//item {
		// 	page: null,
		// 	promise: null
		// }
		var pagesWithPromise = [];

		if (remain <= this.navi_count) {
			remain = this.navi_count + 1;
		}

		for (var i = 0; i < this.maxPages_async; i++) {
			pagesWithPromise.push ( this._pagePromiseObjGenerator() );
		}

		while (remain > 0) {
			for (var i = 0; i < pagesWithPromise.length; i++) {
				let obj = this;

				try {
					await pagesWithPromise[i].promise;
					
					pagesWithPromise[i].promise = asyncClickLinkResBox(pagesWithPromise[i].page).then( function pageGo (res) {
						var result = null;

						if ( (remain > 0) && (res.status === 1) ) {
							remain--;
							result = new Promise((resolve, reject) => {
								clickLink(res.page, obj.pages).then( (r) => {
									var lpromise = new Promise((res, rej) => {
										obj._actualURL(r.page).then( () => {
											res(r);
										})
									});
									return (lpromise);
								}).then( (r) => {
										resolve(pageGo(r));
								});
							});
						}
						else {
							result = res.page.close().then((res)=>{
								return(1);
							},
							(rej)=>{
								return(0);
							});
						}
						
						return(result);
					});
				}
				catch(e) {
					console.log("for test 932");
					console.log(e);
					break;
				}
			}
		}

		if (this.url_history.length < this.navi_count) {
			this.site_size = this.SIZE.LITTLE_SITE;
		}
		else {
			this.site_size = this.SIZE.NORMAL_SITE;
		}
	}
	_pagePromiseObjGenerator () {
		var result = {
			page: null,
			promise: null
		}

		result.promise = clonePage(this.instance, this.page).then( page => {
			result.page = page;
		});

		return(result);
	}
	/**
	@class	Navigation
	@brief	Check on page - collect all urls and change costs. Main actions
	@param	-
	@return	Report
	*/
	async checkin () {
		this.report = {
		   site: [],
		   with_ads_page: "",
		   status: 1
		};

		// this.navi_count

		var obj = this;
		var chkin_promise = null;

		try {
			if (this.site_size === this.SIZE.LITTLE_SITE) {
				this.report.site = this.url_history;
			}
			else {
				chkin_promise = this.gopage()
				.then(()=>obj.modifyMethod())
				.then(function chkIn () {
					var waitFlag = false;
					var lPromise = new Promise ((res, rej) => {
						obj.defineContentClass().then ( ()=>{
							obj.settimepoint();
							return (obj.goRandom());
						} ).then ( (goRandomResult)=>{
							if ( obj._isUniqueLink(obj.wrUrl ().full_url) ) {
								console.log("for test 2146: " + obj.wrUrl().full_url);
								obj.report.site.push ( obj.wrUrl ().full_url );
								waitFlag = true;
							}
							obj.wait_withtimepoints(waitFlag).then(()=>{
								if (goRandomResult.status === 1) {
									if (obj.report.site.length >= obj.navi_count) {
										console.log("for test 925");
										console.log(obj.report.site);
										//close?
										res(1);
									}
									else {
										obj.page.goBack( {waitUntil: 'domcontentloaded'} ).then(()=>{
											res(chkIn ());
										});
									}
								}
								else {
									res(-1);
								}
							});
						} );
					});
					return( lPromise );
				}).catch((e)=>{
					console.log("for test 1604");
					console.log(e);
				});

				await chkin_promise;
			}
		}
		catch(e) {
			console.log(e);
		}

		return(this.report);
	}
	async modifyMethod() {
		this.modify = await allUrlModify(this.page, this.pages[this.wrUrl().full_url].nextpages);
	}
	async goRandom () {
		var result = {
			url: "",
			status: -1
		}

		var oldWrurl = this.wrUrl ();
		var newWrurl = oldWrurl;
		var len = this.url_history.length;
		var allurl_len = 0;
		var clickRes = 0;

		var modify = null;
		var item = {};

		try {
			for (var i = -1; i < len; i++) {
				if (i !== -1) {
					await this.gopage(this.url_history[i]);
				}

				allurl_len = this.pages[oldWrurl.full_url].nextpages.length;

				shuffle(this.pages[oldWrurl.full_url].nextpages);
				
				if (!!this.modify) {
					modify = this.modify;
				}
				else {
					modify = await allUrlModify (this.page, this.pages[oldWrurl.full_url].nextpages);
				}
				//

				while (!!item) {
					try {
						item = modify.next();
						if (!item) {
							break;
						}
						await this.clickHref(item.txt);
					}
					catch(e) {
						console.log(e);
					}
					newWrurl = this.wrUrl ();
					//while maybe?if multiple redirection
					if (newWrurl.domain !== oldWrurl.domain) {
						await this.page.goBack( {waitUntil: 'domcontentloaded'} );
						newWrurl = this.wrUrl ();
						if (newWrurl.domain !== oldWrurl.domain) {
							//if after back not own domain - go to page from history
							break;
						}
					}
					else if (newWrurl.full_url !== oldWrurl.full_url) {
						await this._actualURL();
						i = len;
						result.status = 1;
						result.url = newWrurl.full_url;
						break;
					}
				}
			}
		}
		catch(e) {
			console.log(e);
		}
		return(result);
	}
	async clickHref(href) {
		var result = true;
		var elem = null;

		try {
			elem = await this.page.$("[" + href + "]");
			if (!!elem) {
				await allLinksInOneTab (this.page);
				trueWaitFlag = await trueWaitNavigation(this.page, async () => {
					await elem.click();
				});
			}
			else {
				result = false;
			}
		}
		catch(e) {
			result = false;
		}

		return (result);
	}
	/**
	@class	Navigation
	@brief	Actualize current_url
	@param	wait_flag 					Waiting here
	@return	Current URL
	*/
	async _actualURL (p_page = null, wait_flag = false) {
		var early_i = 0;
		var lUrl = "";

		try {
			if (!p_page) {
				lUrl = this.wrUrl().full_url;
				p_page = this.page;
			}
			else {
				lUrl = p_page.url();
			}
			this.current_url = lUrl;

			if (this.url_history[this.url_history.length-1] !== lUrl || (this.url_history.length === 0)) {
				if (wait_flag) {
					this.wait_withtimepoints();
				}
				this.url_history.push (lUrl);
				if (!this.historyRepeats_flag) {
					early_i = this.url_history.indexOf(lUrl);
					if ((early_i !== -1) && (early_i !== this.url_history.length-1)) {
						this.url_history.splice(early_i, 1);
					}
				}
				await this._addpages(p_page);
			}
		}
		catch(e) {
			console.log(e);
		}
	}
	/**
	@class	Navigation
	@brief	Add pages to object
	@param	-
	@return	-
	*/
	async _addpages(p_page) {
		var j = 0;
		var l_len = 0;
		var tested_url = "";
		var current_url = "";
		var reg_inquotes = /"[^"]*"/;
		var class_content = "";
		
		var lUrl = "";

		var addNoteRes = {};

		if (!p_page) {
			lUrl = this.current_url;
		}
		else {
			lUrl = p_page.url();
		}

		this._addNote(lUrl, 1);
		if (!((this.pages[lUrl]).hasOwnProperty("nextpages"))) {
			if (this.contentClass === "") {
				this.pages[lUrl].nextpages = await AllURL(p_page);
			}
			else {
				//for test 1641
				class_content = await getAllClassTags (p_page, this.contentClass);

				this.pages[lUrl].nextpages = await AllURL(class_content);
			}

			if (this.pages[lUrl].nextpages.length === 0) {
				this.pages[lUrl].nextpages = await AllURL(p_page);
			}
			else {
			}
			
			l_len = this.pages[lUrl].nextpages.length;
			for (j = 0; j < l_len; j++) {
				//delete href and quotes
				try {
					tested_url = this.pages[lUrl].nextpages[j].match(reg_inquotes)[0].replace(/"/g, "");
				}
				catch (err) {
					continue;
				}

				//only own urls
				if (!OwnURL(tested_url, lUrl)) {
					this.pages[lUrl].nextpages.splice(j, 1);
					l_len--;
					j--;
					continue;
				}

				//get absolute url
				tested_url = RelativeToAbsolute (tested_url, lUrl);

				addNoteRes = this._addNote(tested_url, 0);

				if ( !(addNoteRes.newFlag) ) {
					this.pages[addNoteRes.text].cost = this.pages[addNoteRes.text].cost/2;
				}
			}

			this._calcEdge();
		}
	}
	/**
	@brief three conditions:
		no note,
		similar,
		equal here.

		no note - new
		similar
			force - rewrite property with new name
			no force - no actions
		equal
			no actions
	force
		1 									Rewrite
		0 									No force

	@return
		false 							no add
		true 								add note
	*/
	_addNote(added, force = 1) {
		var result = {
			newFlag: false,
			text: ""
		}
		var init_val = 1024;

		var similarStatus = 0;

		var forceCreate = false;
		var bckup = null;

		for (var par in this.pages) {
			similarStatus = similarFlag(added, par);

			// console.log("for test 1119: " + force + "; " + added + "; " + par + "; " + similarStatus);

			if (similarStatus === 2) {
				result.text = par;
				break;
			}
			else if (similarStatus === 1) {
				if (force === 1) {
					forceCreate = true;
					if (!bckup) {
						bckup = this.pages[par];
					}
					else {
						bckup.cost = bckup.cost/(init_val/this.pages[par].cost);
					}
					delete this.pages[par];
				}
				else {
					result.text = par;
					break;
				}
			}
		}
		if (similarStatus === 0) {
			result.newFlag = true;
			this.pages[added] = {};
			this.pages[added].cost = init_val;
			result.text = added;
		}
		if (forceCreate) {
			result.newFlag = true;
			this.pages[added] = bckup;
			result.text = added;
		}

		return (result);
	}
	_isUniqueLink (url) {
		var result = false;
		if (!url) {
			url = this.wrUrl().full_url;
		}
		if ( this.pages.hasOwnProperty(url) ) {
			if (this.pages[url].cost >= this.edgeCost) {
				result = true;
			}
		}
		else {
			result = true;
		}

		return(result);
	}
	//unique all above edge
	//filtered zone - 30%, but zero-width maybe
	_calcEdge () {
		const init_val = 1024;

		var mpFilteredZone = 0.1;

		var edge = 0;
		var min = undefined;
		var max = 0;
		var calc = 0;

		var koef = 1;
		var power = 0;

		for (var par in this.pages) {
			if (typeof min === "undefined") {
				min = this.pages[par].cost;
			}
			else if (this.pages[par].cost < min) {
				min = this.pages[par].cost;
			}

			if (max < this.pages[par].cost) {
				max = this.pages[par].cost;
			}
		}

		if (typeof min === "undefined") {
			min = 0;
			koef = 0;
			// edge = 0;
		}
		else {
			koef = max/min;
			if (koef < 2) {
				// edge = 0;
			}
			else if (koef <= 2) {
				edge = min;
			} else {
				power = Math.log2(koef);
				power = Math.floor(power*mpFilteredZone);

				calc = Math.pow(2, power);
				edge = min*calc;
			}
		}

		this.edgeCost = edge;
		return(edge);
	}
	/**
	@class	Navigation
	@brief	Count records in this.pages
	@param	
	@return	
	*/
	_getpagescount () {
		var count = 0;
		for (var par in this.pages) {
			count++;
		}
		return(count);
	}
	/**
	@class	Navigation
	@brief	Define content class
	@param	-
	@return	Content class
	*/
	async defineContentClass () {
		try {
			this.contentClass = await BiggestOftenClass ( this.page );
		}
		catch(e){
			console.log("for test 805");
			console.log(e);
		}
		
		return (this.contentClass);
	}
	/**
	@class	Navigation
	@brief	Set timepoint for define time periods
	@param	-
	@return	-
	*/
	settimepoint () {
		this.timepoint = (new Date()).getTime();
	}
	/**
	@class	Navigation
	@brief	Wait with timepoints
	@param	-
	@return	-
	*/
	async wait_withtimepoints (waitFlag) {
		var current_point = 0;
		var delta_s = 0;
		var rand_period = 0;

		if (waitFlag) {
			current_point = (new Date()).getTime();
			delta_s = Math.round((current_point - this.timepoint));
			rand_period = getRandom (this._delay_range[0]*1000, this._delay_range[1]*1000);

			if (rand_period > delta_s) {
				await delay(rand_period - delta_s);
			}
			this.settimepoint();
		}
	}
}

/**
	@return
		0 									Not similar
		1										Similar
		2 									Equal
*/
function similarFlag(a, b) {
	const aGarbage = [
		/\?.+/g,
		/\//g
	];
	const cStatus = {
		notSimilar: 0,
		similar: 1,
		equal: 2
	}
	var result = cStatus.notSimilar;
	var prepareTxt = "";
	var substr = "";

	if (a === b) {
		result = cStatus.equal;
	}
	else {
		for (var i = 0; i < 2; i++) {
			if (i === 0) {
				prepareTxt = a;
				substr = b;
			}
			else {
				prepareTxt = b;
				substr = a;
			}
			
			prepareTxt = prepareTxt.replace(substr, "");
			for (var j = 0; j < aGarbage.length; j++) {
				prepareTxt = prepareTxt.replace(aGarbage[j], "");
			}
			if (prepareTxt === "") {
				result = cStatus.similar;
				break;
			}
		}
	}

	return(result);
}

class SParsingModule {
	constructor(page){
		this.S = {
			SUCCESS:{num: 1, text: "Success"},
			WRONG_PAGE: {num: -1, text: "Wrong page"}
		}
		this.status = this.S.SUCCESS;
		this.page = page;

		this.num_elems = [];
	}
	async scan() {
		await this.toTasks();
		await this.listIterator ();
	}
	async listIterator (a = 1, b = 0) {
		var iOnPage = 0;
		var lenPage = 0;

		if (b === 0) {
			b = await this.lastPageNum();
		}

		for (var i = a; i <= b; i++) {
			await this.goNum (i);
			await this.scanOnPage();

			lenPage = this.num_elems.length;
			for (iOnPage = 0; iOnPage < lenPage; iOnPage++) {
				await this.taskVerify(this.num_elems[iOnPage]);
			}
		}
	}
	async screenTask () {
		var dir = "tasks";
		var task_id = 0;
		var scrname = "";

		console.log("for test 750");

		var url = this.page.url();

		var searchRes = url.match(/adv=\d+/);
		
		if (!!searchRes) {
			task_id = parseInt(String(searchRes[0]));
		}

		console.log("for test 728: " + task_id);

		//div[class="tskblank1"] - tag be screened
	}
	async taskVerify(css) {
		var oldUrl = this.page.url();
		var newUrl = oldUrl;

		var goodflag = false;

		await allLinksInOneTab(this.page);
		await trueWaitNavigation(this.page, async () => {
			await fastClick(this.page, css);
		});

		goodflag = await this.taskCheck ();
		console.log("for test 748: " + goodflag);
		goodflag = true;
		if (goodflag) {
			// console.log("for test 701: Good task");
			console.log("for test 751");
			await this.screenTask ();
		}

		newUrl = this.page.url();
		if (newUrl !== oldUrl) {
			await this.page.goBack();
		}
	}
	async goNum (num) {
		var flagStop = false;
		var current = 0;
		while (!flagStop) {
			current = this.currentNum();
			if (num > current) {
				await this.navigationGo (1);
			}
			else if (num < current) {
				await this.navigationGo (-1);
			}
			else {
				flagStop = true;
			}
		}
	}
	/**
	dir 1 	forward
			-1	back
	*/
	async navigationGo (dir) {
		var current = this.currentNum();
		var next = current + dir;
		var css_sel = 'a[href="/work-task.php?p="]';

		css_sel = css_sel.replace("?p=", "?p=" + next);

		await fastClick(this.page, css_sel);
	}
	currentNum () {
		var url = this.page.url();
		var regexp = /p=\d+/g;
		var num = 1;

		var execRes = regexp.exec(url);
		if (!!execRes) {
			num = +execRes[0].replace("p=", "");
		}

		return(num);
	}
	async lastPageNum () {
		var result = 0;

		result = await this.page.evaluate(()=>{
			var res = 0;

			var aPagi = document.querySelectorAll('table[class="navigation"] a[class="selpage"]');
			var len = aPagi.length;

			if (len > 0) {
				len--;
				res = +aPagi[len].innerHTML;
			}
			return (res);
		}, null);

		return(result);
	}
	async toTasks() {
		await fastClick(this.page, "a[href='/work-task.php']");
		await fastClick(this.page, "span#tsk_mnu2");
		await fastClick(this.page, "span[onclick~='javascript:gotfilter(9,2);']");
		await fastClick(this.page, "span[onclick~='javascript:gosorttask(2);']");
	}
	async scanOnPage() {
		this.num_elems = await this.page.evaluate(() => {
			var nums_true_tasks = [];
			var all_tasks = document.querySelectorAll("table[class='work-serf'] tr");
			var len = all_tasks.length;
			var goodFlag = true;
			var elem = {};
			var cssSel = "";

			for (var i = 0; i < len; i++) {
				goodFlag = true;

				//polytask
				elem = all_tasks[i].querySelector('span[class="polytask"]');
				goodFlag = !!elem;

				// executable
				if (goodFlag) {
					elem = all_tasks[i].querySelector('span[class="taskimg"]');
					goodFlag = !!elem;
				}

				// 5 stars
				if (goodFlag) {
					elem = all_tasks[i].querySelector('span[class="rating5"]');
					goodFlag = !!elem;
				}

				if (goodFlag) {
					elem = all_tasks[i].querySelector("a");
					// elem.target = "_self";
					cssSel = 'a[href="' + elem.getAttribute('href') + '"]';
					nums_true_tasks.push(cssSel);
				}
			}
			return(nums_true_tasks);
		}, null);
	}
	async taskCheck () {
		this.minusWords = [
			"куки",
			"cookies",
			"ctrl+shift+del",
			"кеш",
			"ОС",
			"Разрешение экрана",
			"скрин",
			"код"
		]
		this.execRatio = 10;
		this.nonEmptyMax = 4;

		var goodFlag = true;

		goodFlag = await this.page.evaluate((aminus, ratio, nonEmptyMax)=>{
			var flag = 1;

			var minusLen = aminus.length;

			var descItem = document.querySelector('span[class="taskdescription"]');
			var questionItem = document.querySelector('span[class="taskquestion"]');

			var textDescription = descItem.textContent;
			var textTaskquestion = questionItem.textContent;
			var commonText = textDescription + "\n" + textTaskquestion;

			//minus-words
			for (var i = 0; i < minusLen; i++) {
				if (commonText.search(aminus[i]) !== -1) {
					flag = -1;
					break;
				}
			}

			//exec:non-exec
			if (flag === 1) {
				let statElem = document.querySelector("table[class='tskstat']");
				let aNums = (String (statElem.innerHTML)).match(/>\d+</g);
				let approved = 0;
				let refused = 0;
				console.log("for test 2210");
				console.log(aNums);

				approved = parseInt (aNums[0], 10);
				refused = parseInt (aNums[1], 10);

				if (approved/refused < ratio) {
					flag = -2;
				}
			}

			//count lines in report requires - 2 and less
			//3 and less <br>
			//split <br>, innerHTML
			//for test 2222
			if (flag === 1) {
				let question = questionItem.innerHTML;
				let arrLines = question.split("<br>");

				let countLines = arrLines.length;
				let nonEmptyLinesCount = 0;

				for (var j = 0; j < countLines; j++) {
					if (arrLines[j].search(/\S+/g) !== -1) {
						nonEmptyLinesCount++;
						if (nonEmptyLinesCount > nonEmptyMax) {
							flag = -3;
							break;
						}
					}
				}
			}

			return (flag);

		}, this.minusWords, this.execRatio, this.nonEmptyMax);

		if (goodFlag < 1) {
			console.log("for test 739: " + goodFlag);
			goodFlag = false;
		}
		else {
			goodFlag = true;
		}

		return(goodFlag);
	}
	screenTask() {
		var result = 1;
		//

		return(result);
	}
}

//-------------//End - Seosprint//---------------

//------------------//Files//--------------------

async function readFile (p_file, parse_on) {
	const error_val = -1;

	var result = "";

	try {
		var res_promise = new Promise(function(resolve,reject){
			fs.readFile(p_file, {encoding: 'utf-8'}, function(err,data){
				if (!err){
					resolve(data);
				}else{
					reject(error_val);
				}
      });
		});
		result = await res_promise;

		if (parse_on) {
	    try {
	      result = JSON.parse(result);
	    } catch (loc_error) {
	      result = -1;
	    }
	  }
	}
	catch(e) {
		result = error_val;
	}

	return(result);
}

//---------------//End - Files//-----------------

//------------------//Logs//---------------------

/**
@class  Logs
@brief  Journal module. Through .see may be trace objects.
@param  p_dir               Directory
        p_file              Logs file
        p_timestamp_flag
          true              Set timestamp
          false             Do not set timestamp
        p_clear_every_time  Clear file every time (not working yet)
          true
          false
@return Module
*/
var Journal_Module = function (p_file, p_timestamp_flag, p_clear_every_time) {
	var options = {
		flags: p_clear_every_time?"w":"a",
		defaultEncoding: 'utf8',
	  fd: null,
	  // mode: 0o666,
	  // mode: fs.O_APPEND | fs.O_RDWR,
	  autoClose: true
	};

  this.file = p_file;
  this._WStream = fs.createWriteStream(p_file, options);
  this.time_flag = p_timestamp_flag;
  this.clear = p_clear_every_time;
  //Наблюдаемые значения
  this.see = {};
}

/**
@class  Logs
@brief  Write text, one-line typical. %variable% - replace to this.see.variable
@param  p_text              Text
@return 1                   Success
        -1                  Error
*/
Journal_Module.prototype.write = function (p_text) {
  var result = 1;
  var journal = this;
  if (typeof p_text === "string") {
    p_text = p_text.replace (/%[^%]*/g, function (x) {
        x = x.replace (/%/g, "");
        if (journal.see.hasOwnProperty (x)) {
        return journal.see[x];
      }
      return x;
    });
  }

  if (!!this.clear) {
    //clear file anyhow
  }
  if (!!this.time_flag) {
    p_text = timeStamp() + p_text;
  }
  this.writeFS_Stream(p_text + "\n");
  return (result);
}

/**
@class	Logs
@brief	Write logs in stream
@param	
@return	
*/
Journal_Module.prototype.writeFS_Stream = function (p_text) {
	var result = 1;
	var l_stream = this._WStream;
	
	try{
		l_stream.write(p_text);
	}
	catch(e) {
		console.log(e);
	}

	return (result);
}

/**
@class  Logs
@brief  Return timestamp
@param  -
@return Time in format DD.MM.YYYY HH:MM:SS
*/
function timeStamp () {
  var result = 1;
  var sdate = GetCurrentDate_v2 ();

  for (let t in sdate) {
    sdate[t] = String(sdate[t]);
    if (sdate[t].length < 2) {
      sdate[t] = "0" + sdate[t];
    }
  }

  result = sdate.day + "." +  sdate.month + "." + sdate.year + " " + sdate.hours + ":" + sdate.minutes + ":" + sdate.seconds + " : ";

  return (result);
}

/**
@class  Logs
@brief  Проверяет, создана ли переменная с журналом. Если создана, делает запись
@param  p_text              Записываемый текст
@return 1                   Успешно выполнено
        -1                  Ошибка при выполнении
*/
function toJournal (p_text) {
  var result = 1;
  if (typeof(g_Journal) !== "undefined") {
    g_Journal.write(p_text);
  }
  return (result);
}

async function savePage (page, filename = "", pScreenShotFlag = false) {
  var result = 1;
  var date = {
    seconds: 0,
    minutes: 0,
    hours: 0,
    day: 0,
    month: 0,
    year: 0
  };
  var content = "";

  if (!filename) {
    date = GetCurrentDate_v2 ();
    for (t in date) {
      date[t] = String(date[t]);
      if (date[t].length < 2) {
        date[t] = "0" + date[t];
      }
    }
    filename = "date_" + date.day + "_" + date.month + "_" + date.year + "_time_" + date.hours + "_" + date.minutes + "_" + date.seconds + ".html";
  }

  //save file
  try {
  	content = await page.content();
  	fs.writeFile(filename, content, (err) => {
  		if (err) throw err;
  	});
  }
  catch(e) {
  	result = -1;
  }

  return (result);
}

//---------------//End - Logs//------------------

//-------------//Data generation//---------------

/**
@class    data_generation
@brief    Функция возвращает случайное число в нужном диапазоне
@param    min             Минимальное значение
          max             Максимальное значение
@return   min..max        Случайное значение в диапазоне от min до max включительно
*/
function getRandom (min, max) {
  min = +min;
  max = +max;

  var temp = 0;
  if (min > max) {
    temp = min;
    min = max;
    max = temp;
  }
  max = max + 1;
  var result = Math.floor(Math.random() * (max - min) + min);
  if (result === max) {
    result -= 1;
  }
  return (result);
}

/**
@class    data_generation
@brief    Определяет случайное число на базе данного числа и 
            допустимого отклонения
@param    num             Изменяемое число
          deviation       0..100. Допустимые проценты отклонения от
                            номинала.
@return   Измененное число.
*/
function RandomDeviation (num, deviation) {
  var result = Math.round (num*(getRandom(-deviation, deviation)/100 + 1));
  return (result);
}

/**
@class	data_generation
@brief	Yes or no? True of false?
@param	p_chance 						Chance of yes, int %
				p_f 								function
@return	
*/
async function proc (p_chance, p_f) {
	var result = 0;

	if (isNaN(p_chance)) {
		p_chance = 50;
	}
	else if (p_chance > 100) {
		p_chance = 100;
		result = true;
	}
	else if (p_chance < 0) {
		p_chance = 0;
		result = false;
	}

	if (result === 0) {
		if (getRandom(0, 100) < p_chance) {
			result = true;
		}
		else {
			result = false;
		}
	}

	if (!!p_f) {
		if (result) {
			await p_f();
		}
	}
	
	return (result);
}

//----------//End - Data generation//------------

//----------------//Main part//------------------

var go_num = 0;

var g_Journal = new Journal_Module(FILE_LOG, true, false);

toJournal ("------------//Начало работы Go " + go_num + "//----------");

Go[go_num]();

//-------------//End - Main part//---------------
