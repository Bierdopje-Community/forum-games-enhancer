(function () {
  insertCSS('https://rawgit.com/Bierdopje-Community/forum-games-enhancer/master/dist/scoped-twbs.css');
  insertCSS('https://rawgit.com/Bierdopje-Community/forum-games-enhancer/master/dist/stylesheet.css');

  function clearDatabaseCheck() {
    if (/db.destroy.games.scoreboard/.test(windowLocation)) {
      new PouchDB('BD.games.scoreboard').destroy();
      log('Destroyed database');
      return; //quit
    }
  }

  var db = new PouchDB('BD.games.scoreboard', {
    auto_compaction: true
  });

  var currentScoreboard;

  $(function () {
    clearDatabaseCheck();
    init(function () {
      addButtons();
    });
  });

  function addButtons() {
    var forumReal = $('.maincontent .content .forumline', '#page');
    var forum = forumReal.clone(); // clone so I can remove elements but not from DOM
    $('tr[id$="1337"]', forum).detach(); // remove comments made by this script

    var comments = {};
    getCommentsOnPage(forum).map(function (comment) {
      // Only keep commentIds older than the current scoreboard date
      if (comment.date.unix() <= currentScoreboard.date)
        return true; // continue
      comments[comment.id] = comment;
    });

    // loop over all comments and inject buttons where necessary
    $('tr[id^="replyheader"] img[src$="comments.png"]', forumReal).each(function () {
      var element = $(this);
      var td = element.closest('td');
      var tr = td.closest('tr');

      // check if id is in filtered commentIds;
      var commentId = tr.attr('id').substr(12);
      if (!(comments.hasOwnProperty(commentId)))
        return true; // continue

      var comment = comments[commentId];

      var button = $('<a href="#replybox" class="twbs BD__FORUM_GAMES_CORRECT_ANSER"></a>');
      button.append('<span class="glyphicon glyphicon-ok" aria-hidden="true"></span>');
      button.attr('title', 'Markeer dit antwoord als correct!');

      button.click(function () {
        var currentScores = {};
        if (currentScoreboard && currentScoreboard.scores)
          currentScores = $.extend({}, currentScoreboard.scores);

        var score = 1;

        if (currentScores.hasOwnProperty(comment.user.name))
          score += currentScores[comment.user.name];

        currentScores[comment.user.name] = score;

        var usersWithScoreOfOne = [];
        Object.keys(currentScores).map(function (username) {
          var score = currentScores[username];
          if (score > 1)
            return true; // continue

          usersWithScoreOfOne.push(username);
          delete currentScores[username];
        });
        usersWithScoreOfOne = usersWithScoreOfOne.join(', ');

        var usersSorted = Object.keys(currentScores);
        usersSorted.sort(function (a, b) {
          var val = currentScores[b] - currentScores[a];
          if (val == 0)
            val = a.localeCompare(b);

          return val;
        });

        var i = 0;
        var templateData = usersSorted.map(function (user) {
          return {
            position: ++i,
            user: user,
            score: currentScores[user],
            isWinner: user == comment.user.name
          }
        });

        var replyText = Handlebars.templates.scoreboardReply({
          'scores': templateData
        });

        if (usersWithScoreOfOne.length)
          replyText += lpad(usersSorted.length + 1) + '. ' + usersWithScoreOfOne + ' (1 punt)';

        $.post('http://www.bierdopje.com/ajax', {
          'action': 'GetQuote',
          'qid': comment.id,
          'type': 'forum'
        }, function (data) {
          var start = data.indexOf('<message>') + 9;
          var end = data.indexOf('</message>');
          var message = data.substring(start, end);
          $('#replybox').text(
            message + 'Correct!' + "\r\n\r\n" + replyText
          );
        });

      });

      td.prepend(button);
    });


  }

  function init(callback) {
    log('Getting url\'s on page');
    var urls = getPageUrls();
    log('Found ' + urls.length + ' on page');

    var scores = [];
    var period = 'month';
    var promises = [];
    urls.map(function (url) {
      var id = md5(url);

      var promise = new Promise(function (resolve) {
        fetchCachedScoreboard(id, resolve, function () {
          // if it's not in cache, fetch it
          getScoreboardFromPage(url, resolve);
        });
      });

      promises.push(promise);
    });

    // Wait for all promises to resolve
    // then show the data
    Promise.all(promises).then(function (newScores) {
      scores = [].concat.apply([], newScores);
      if (scores.length <= 0) {
        log('No scores found');
        return;
      }
      currentScoreboard = scores.slice(-1)[0]; // last element
      log('Found ' + scores.length + ' scores in this thread');

      var comment = $(Handlebars.templates.forumRow());
      $('.content.go-wide table.forumline tr[id^="replyside"]').last().after(comment);

      updatePeriodType(period);
      callback();
    });

    var updatePeriodType = function (newPeriod) {
      period = newPeriod;
      var scoreBoards = createScoreBoards(period);
      createScoreBoardElements(scoreBoards);
      showScoreBoard();
    };

    $(document).on('click', '.BD__select_period a', function (e) {
      e.preventDefault();
      var start = $(this).attr('data-start');
      showScoreBoard(start);
    });

    var createScoreBoards = function (period) {
      var factory = new ScoreBoardFactory(scores);
      return factory.create(period).reverse();
    };

    var createScoreBoardElements = function (scoreBoards) {
      var forumBody = $(Handlebars.templates.forumBody({scoreBoards: scoreBoards}));
      $('.container-fluid', '#BD_FORUM_GAMES_ENHANCER').html(forumBody);
    };

    var showScoreBoard = function (start) {
      var scoreBoards = $('table[data-scoreboard]');
      scoreBoards.hide();
      var scoreBoard;

      if (start)
        scoreBoard = $('table[data-scoreboard][data-start="' + start + '"]');
      else
        scoreBoard = $(scoreBoards[0]);

      start = scoreBoard.attr('data-start');
      start = $('.BD__select_period a[data-start="' + start + '"]').text();
      $('.BD__selected_periode').text(start);

      scoreBoard.show();
    };
  }

  function getPageUrls() {
    var url = windowLocation.replace('/last', '');  //remove /last
    url = url.replace(/\/\d+$/, ''); //remove pageNr /41

    var forum = $('.maincontent .content .forumline', '#page');
    var lastPage = $('.pagination ul.rightfloat li:eq(-1)', forum).text();
    lastPage = parseInt(lastPage);

    var urls = [];
    for (var pageNr = 1; pageNr <= lastPage; pageNr++) {
      urls.push(url + '/' + pageNr);
    }

    return urls;
  }

  function getScoreboardFromPage(url, callback) {
    log('Requesting ' + url);
    $.get(url, function (data) {
      data = $.parseHTML(data);
      var forum = $('#page .maincontent .content .forumline', data);

      var scoreBoard = [];
      var cacheDate = null; // newest commentDate on page ( for cache purposes )
      var comments = getCommentsOnPage(forum);
      comments.map(function (comment) {
        var scores = extractScoresFromComment(comment);
        if (Object.keys(scores).length <= 0)
          return true; // continue

        // replace cacheDate if the new date is newer
        if (!cacheDate || cacheDate.isBefore(comment.date))
          cacheDate = comment.date;

        scoreBoard.push({
          date: comment.date.unix(), // format in unix for db
          scores: scores
        });
      });

      callback(scoreBoard);

      if (scoreBoard.length <= 0)
        return;

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

    db.get(id).then(function (doc) {
      var pageAge = doc.updatedAt - doc.createdAt;
      var updatedAgo = curTimestamp - doc.updatedAt;
      log('Found cache for ' + id + ' with age ' + pageAge);

      // If the time between the last comment and time of insertion is less than a week.
      // And the last update was more than a day ago.
      // We callback an error.
      if (pageAge < 604800 && updatedAgo > 86400) {
        log('However, it needs a refresh');
        errorCallback('Page needs a refresh');
        return;
      }

      callback(doc.scoreBoard);
    }).catch(errorCallback); // catch any errors and send it to the errorCallback
  }

  function cacheScoreboard(cacheData) {
    var id = md5(cacheData.url);
    var curTimestamp = moment().unix();

    db.get(id).catch(function (err) {
      if (err.status === 404) {
        return {
          _id: id,
          scoreBoard: [],
          createdAt: -1,
          updatedAt: -1
        };
      } else {
        throw err;
      }
    }).then(function (doc) {
      doc.scoreBoard = cacheData.scoreBoard;
      doc.createdAt = cacheData.date.unix();
      doc.updatedAt = curTimestamp;

      db.put(doc);
    });
  }

  function extractScoresFromComment(comment) {
    // TODO: make sure the scoreboard wasn't quoted
    var regex = /\s?\d+[\.\)]\s?(.*?)\s?\(\s?(\d+)\s* punt/gi;
    var body = comment.bodyel.text();

    var scores = {};

    var match;
    while ((match = regex.exec(body)) !== null) {
      var username = match[1].trim();
      var score = parseInt(match[2]);

      if (score == 1) {
        username.split(',').map(function (username) {
          username = username.trim();
          scores[username] = 1;
        });
      } else {
        scores[username] = score;
      }
    }

    log('Found ' + Object.keys(scores).length + ' scores in comment.');

    return scores;
  }

  function getCommentsOnPage(forum) {
    var comments = {};

    $('tr[id^="reply"]', forum).each(function () {
      var element = $(this);
      var elementType = element.attr('name');
      var commentId = parseInt(element.attr('id').split('-')[1]);

      var comment = {};
      if (comments.hasOwnProperty('' + commentId))
        comment = comments[commentId];

      if (elementType == 'replyheader') {
        var header = parseCommentHeader(element);
        if (foundComment(header))
          comment = mergeCommentContent(comment, header);
      } else if (elementType == 'replyside') {
        var body = parseCommentBody(element);
        if (foundComment(body))
          comment = mergeCommentContent(comment, body);
      }

      comments[commentId] = comment;
    });

    // validate comments in a crappy way
    var validComments = [];
    Object.keys(comments).map(function (id) {
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

      if (isValid) {
        if (!comment.date) {
          console.error(comment);
          throw new Error('This comment has no correct date');
        }

        validComments.push(comment);
      }
    });
    comments = validComments;

    log('Found ' + comments.length + ' comments');

    return comments;
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
      permaLink: permaLink,
      user: user,
      date: date,
      headerel: element
    };
  }

  function parseCommentBody(element) {
    var commentId = parseInt(element.attr('id').split('-')[1]);
    var body = $('span[id^=post].postbody', element);

    return {
      id: commentId,
      body: body.html(),
      bodyel: body
    };
  }

  function insertCSS(url) {
    var pageHead = document.getElementsByTagName("HEAD")[0];
    var link = window.document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = url;
    pageHead.insertBefore(link, pageHead.lastChild);
  }

  function log(message) {
    if (DEBUG)
      console.log('[BD.games] ' + message);
  }

  var ScoreBoardFactory = (function () {
    var ScoreBoardFactory = function (scoreBoards) {
      var self = this;
      var _prevNewest;
      this.dateScoresMap = {};

      this.scoreDates = scoreBoards.map(function (scoreBoard) {
        // store a mapping between date and scores
        self.dateScoresMap[parseInt(scoreBoard.date)] = scoreBoard.scores;
        // return momentjs date
        return moment.unix(scoreBoard.date);
      });
      // sort dates from old to new
      this.scoreDates.sort(function (dateA, dateB) {
        return dateA.unix() - dateB.unix();
      });

      this.create = function (periodType) {
        if (!ScoreBoardFactory.isValidPeriodType(periodType)) {
          throw new Error('Invalid periodType');
        }

        if (DEBUG) {
          var tmp = this.scoreDates.map(function (date) {
            return date.format('YYYY-MM-D');
          });
          console.log(tmp);
        }

        var period = ScoreBoardFactory.createPeriod(this.scoreDates[0], periodType);
        log('Making period from "' + period.start.format('YYYY MMM D') + '" until "' + period.end.format('YYYY MMM D') + '"');

        var oldest = _prevNewest || this.scoreDates.shift();
        var youngest;

        // in case there are less than two scores in this period, we say we don't have enough data
        if (this.scoreDates.length <= 0) {
          log('Not enough data yet');
          return [];
        }

        // look for youngest date that is in this period
        var i = 0;
        for (; i < this.scoreDates.length && this.isInPeriod(this.scoreDates[i], period); i++) {
        }

        if (i == 0) {
          log('Not enough data in this period.');
          if (this.scoreDates.length > 0) {
            return [].concat.apply([], this.create(periodType));
          } else {
            return [];
          }
        }

        youngest = _prevNewest = this.scoreDates[i - 1];
        // remove processed scoreDates
        this.scoreDates.splice(0, i);

        log('Ending period with ' + youngest.format('YYYY-MM-D'));

        var newScores = this.dateScoresMap[youngest.unix()];
        var oldScores = this.dateScoresMap[oldest.unix()];

        // generate diff
        var diff = ScoreBoardFactory.diffCalculator(newScores, oldScores);

        // format scores
        var scores = Object.keys(diff).map(function (username) {
          return {
            username: username,
            score: diff[username]
          }
        });

        // sort scores inverse ( highest first )
        scores.sort(function (a, b) {
          return b.score - a.score;
        });

        // add scores to period;
        period.scores = scores;
        period.start = period.start.format('DD-MMM-YYYY');
        period.end = period.end.format('DD-MMM-YYYY');

        // put it in an array
        period = [period];

        // lets recursively call this function until no scoreDates are left
        if (this.scoreDates.length > 0) {
          return [].concat.apply(period, this.create(periodType));
        } else {
          return period;
        }
      };

      this.isInPeriod = function (date, period) {
        var isBetween = date.isSameOrAfter(period.start, 'day');
        isBetween = isBetween && date.isSameOrBefore(period.end, 'day');
        log(date.format('YYYY-MM-D') + ' is ' + (isBetween ? '' : 'not ') + 'in period');
        return isBetween;
      };
    };

    ScoreBoardFactory.createPeriod = function (date, periodType) {
      if (!ScoreBoardFactory.isValidPeriodType(periodType))
        throw new Error('Invalid periodType');

      var originalPeriodType = periodType;
      var normalPeriods = ['week', 'month', 'year'];
      var abnormalToNormal = {
        'trimester': 'year',
        'halfyear': 'year'
      };
      var isNormalPeriod = normalPeriods.indexOf(periodType) >= 0;

      if (!isNormalPeriod) {
        periodType = abnormalToNormal[periodType];
      }

      var period = {
        start: moment(date).startOf(periodType),
        end: moment(date).endOf(periodType)
      };

      if (isNormalPeriod)
        return period;

      var month, adjust;
      if (originalPeriodType == 'trimester') {
        // Figure out in what part of the year we are
        /*
         01,02,03 -> add 0 months to start
         04,05,06 -> add 3 months to start
         07,08,09 -> add 6 months to start
         10,11,12 -> add 9 months to start
         */

        month = date.month() + 1;
        adjust = Math.ceil(month / 3) * 3 - 3;

        period.start = period.start.add(adjust, 'months');
        period.end = moment(period.start).add(3, 'months').subtract(1, 'day');
      }
      if (originalPeriodType == 'halfyear') {
        // Figure out in what part of the year we are
        /*
         01,02,03,04,05,06 -> add 0 months to start
         07,08,09,10,11,12 -> add 6 months to start
         */

        month = date.month() + 1;
        adjust = Math.ceil(month / 6) * 6 - 6;

        period.start = period.start.add(adjust, 'months');
        period.end = moment(period.start).add(6, 'months').subtract(1, 'day');
      }

      return period;
    };

    ScoreBoardFactory.validPeriods = ['week', 'trimester', 'month', 'halfyear', 'year'];

    ScoreBoardFactory.isValidPeriodType = function (periodType) {
      return ScoreBoardFactory.validPeriods.indexOf(periodType) >= 0;
    };

    ScoreBoardFactory.diffCalculator = function (newScores, oldScores) {
      var usersOld = Object.keys(oldScores);

      var scores = {};
      Object.keys(newScores).map(function (username) {
        var existsInOld = usersOld.indexOf(username) >= 0;

        var score;
        if (existsInOld) {
          score = newScores[username] - oldScores[username];
        } else {
          score = newScores[username];
        }

        if (score <= 0)
          return true; //continue

        scores[username] = score;
      });

      return scores;
    };

    return ScoreBoardFactory;
  })();
})();

Handlebars.registerHelper('lpad', function (text, width) {
  return lpad(text, width);
});

function lpad(n, width, z) {
  z = z || '0';
  if (typeof width == 'object')
    width = 2;
  width = width || 2;
  n = n + '';

  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}