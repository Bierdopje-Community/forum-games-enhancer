// ==UserScript==
// @name       BD Forum game enhancer
// @namespace  http://www.bierdopje.com
// @version    0.01
// @description  Creates an interactive scoreboard of the played games and a few enhancements
// @grant      unsafeWindow
// @match      http://www.bierdopje.com/forum/forum-games/topic/*
// @require    https://code.jquery.com/jquery-2.1.4.min.js
// @require    https://cdnjs.cloudflare.com/ajax/libs/pouchdb/5.2.0/pouchdb.min.js
// @require    https://cdnjs.cloudflare.com/ajax/libs/blueimp-md5/2.1.0/js/md5.min.js
// @require    http://momentjs.com/downloads/moment-with-locales.min.js
// @copyright  2016+, Robin Houtevelts
// @run-at     document-start
// ==/UserScript==

if (window.top != window.self)
  return;

moment.locale('nl');
var CSS_URL      = 'https://bierdopje-api.houtevelts.com/scoped-twbs.css';
var windowLocation = window.location.href.split("#")[0];

if(/db.destroy.games.scoreboard/.test(windowLocation)) {
  new PouchDB('BD.games.scoreboard').destroy();
  log('Destroyed database');
  return; //quit
}

var db = new PouchDB('BD.games.scoreboard', {
  auto_compaction: true
});

$(function() {
  insertCSS(CSS_URL);
  init();
});

function init() {
  log('Getting url\'s on page');
  var urls = getPageUrls();
  log('Found ' + urls.length + ' on page');
  
  var promises = [];
  urls.map(function(url) {
    var id = md5(url);
    
    var promise = new Promise(function(resolve, reject) {
      fetchCachedScoreboard(id, resolve, function() {
        // if it's not in cache, fetch it
        getScoreboardFromPage(url, resolve);
      });
    });
    
    promises.push(promise);
  });
  
  // Wait for all promises to resolve
  // then show the data
  Promise.all(promises).then(function(scoreBoards) {
    scoreBoards = [].concat.apply([], scoreBoards);
    console.log(scoreBoards);
    
  });
}

function getPageUrls() {
  var url = windowLocation.replace('/last', '');  //remove /last
      url = windowLocation.replace(/\/\d+$/, ''); //remove pageNr /41
  
  var forum = $('#page .maincontent .content .forumline');
  var lastPage = $('.pagination ul.rightfloat li:eq(-1)', forum).text();
      lastPage = parseInt(lastPage);
  
  var urls = [];
  for (var pageNr = 1; pageNr <= lastPage; pageNr++) {
    urls.push(url + '/' + pageNr);
  }
  
  return urls;
}

function getScoreboardFromPage(url, callback) {
  log('Requesting '+url);
  $.get(url, function(data) {
    data = $.parseHTML(data);
    var forum = $('#page .maincontent .content .forumline', data);
    
    var scoreBoard = [];
    var cacheDate = null; // newest commentDate on page ( for cache purposes )
    getCommentsOnPage(forum, function(comments) {
      comments.map(function(comment) {
        extractScoresFromComment(comment, function(scores) {
          if(Object.keys(scores).length <= 0)
            return true; // continue
          
          // replace cacheDate if the new date is newer
          if(!cacheDate || cacheDate.isBefore(comment.date)) {
            cacheDate = comment.date;
          }
          
          scoreBoard.push({
            date:   comment.date.unix(), // format in unix for db
            scores: scores
          });
        });
      });
    });
    
    callback(scoreBoard);
    
    var cacheData = {
      url: url,
      date: cacheDate,
      scoreBoard: scoreBoard
    };
    
    cacheScoreboard(cacheData);
  });
}

function fetchCachedScoreboard(id, callback, errorCallback) {
  var curTimestamp = moment().unix();

  return db.get(id).then(function(doc) {
    var pageAge = curTimestamp - doc.createdAt;
    var updatedAgo = curTimestamp - doc.updatedAt;
    log('Found cache for '+id);
    
    // If the page itself is younger than a week
    // and the last update was more then a day ago
    // we throw an error
    if (pageAge < 604800 && updatedAgo > 86400) {
      log('However, it need a refresh');
      throw new Error('Page needs a refresh');
    }
    
    callback(doc.scoreBoard);
  }).catch(errorCallback); // catch any errors and send it to the errorCallback
}

function cacheScoreboard(cacheData) {
  var id   = md5(cacheData.url);
  var curTimestamp = moment().unix();
  
  db.get(id).catch(function(err) {
    if (err.status === 404) {
        return {
          _id: id,
          scoreBoard: [],
          createdAt: -1,
          updatedAt: -1,
        };
    } else {
        throw err;
    }
  }).then(function(doc) {
    doc.scoreBoard = cacheData.scoreBoard;
    doc.createdAt = cacheData.date.unix();
    doc.updatedAt = curTimestamp;
    
    db.put(doc);
  });
}

function extractScoresFromComment(comment, callback) {
  // TODO: make sure the scoreboard wasn't quoted
  var regex = /\s?\d+[\.\)]\s?([^,]*?)\s?\(\s?(\d+)\s* punt/gi;
  var body = comment.bodyel.text();
  
  var scores = {};
  
  var match;
  while ((match = regex.exec(body)) !== null) {
    var username = match[1]; // TODO trim
    var score    = parseInt(match[2]);
    
    scores[username] = score;
  }
  
  log('Found '+Object.keys(scores).length+' scores in comment.');
  
  if (typeof callback == 'function')
    callback(scores);
  return scores;
}

function getCommentsOnPage(forum, callback) {
  var comments = {};
  
  $('tr[id^="reply"]', forum).each(function(){      
    var element = $(this);
    var elementType = element.attr('name');
    var commentId = parseInt(element.attr('id').split('-')[1]);
    
    var comment = {};
    if(comments.hasOwnProperty(commentId))
      comment = comments[commentId];
    
    if (elementType == 'replyheader') {
      var header = parseCommentHeader(element);
      if(foundComment(header))
        comment = mergeCommentContent(comment, header);
    } else if (elementType == 'replyside') {
      var body = parseCommentBody(element);
      if(foundComment(body))
        comment = mergeCommentContent(comment, body);
    }
    
    comments[commentId] = comment;
  });
 
  // validate comments in a crappy way
  var validComments = [];
  Object.keys(comments).map(function(id) {
    var comment = comments[id];
    var isValid = comment.hasOwnProperty('id')
        && comment.hasOwnProperty('permaLink')
        && comment.hasOwnProperty('user')
        && comment.user.hasOwnProperty('name')
        && comment.user.hasOwnProperty('link')
        && comment.hasOwnProperty('date')
        && comment.hasOwnProperty('headerel')
        && comment.hasOwnProperty('body')
        && comment.hasOwnProperty('bodyel');
        
    if(isValid)
      validComments.push(comment);
  });
  comments = validComments;
  
  log('Found '+comments.length+' comments');
  
  callback(comments);
}

function foundComment(commentContent) {
  return commentContent.hasOwnProperty('id');
}

function mergeCommentContent(oldContent, newContent) {
    // Merge oldContent and newContent
    return jQuery.extend({}, oldContent, newContent, true);
  }

function parseCommentHeader(element) {
  var commentId = parseInt(element.attr('id').split('-')[1]);
  var permaLink = windowLocation + '#' + commentId;
  
  var userHref = $('.postname a.user', element);
  var user = {};
    user.name = userHref.text();
    user.link = 'http://www.bierdopje.com' + userHref.attr('href');
   
  var dateString = $('td:eq(1) p', element).text(); //Geplaatst op woensdag 26 augustus 2015 20:01
      dateString = /(\d+ .*?)$/g.exec(dateString)[1]; // 26 augustus 2015 20:01
  var date = moment(dateString, 'DD MMMM YYYY HH:mm');
  
  return {
    id: commentId,
    permaLink : permaLink,
    user : user,
    date : date,
    headerel : element
  };
}

function parseCommentBody(element) {
  var commentId = parseInt(element.attr('id').split('-')[1]);
  var body = $('span[id^=post].postbody', element);
  
  return {
    id : commentId,
    body : body.html(),
    bodyel : body
  };
}

function insertCSS(url) {
  var pageHead = document.getElementsByTagName("HEAD")[0];
  var link = window.document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = url;
  pageHead.insertBefore(link,pageHead.lastChild);
}

function log(message) {
  console.log('[BD.games] '+message);
}
