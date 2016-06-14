(function() {
  'use strict';

  angular.module('directives', []);
  angular.module('constants', []);
  // angular.module('templates', []);
  angular.module('filters', []);

  var app = angular.module('calendar_pk', ['directives', 'constants', 'templates', 'filters']);

})();

(function() {
  'use strict';

  angular.module('constants')
  .constant('calendarConfig', {
    formatDay: 'dd',
    formatDayHeader: 'EEE',
    formatMonthTitle: 'MMMM yyyy',
    eventSource: null,
    queryMode: 'local',
    step: 30,
    startingDayMonth: 1,
  });

})();

(function() {
  'use strict';

  angular.module('directives')
    .directive('calendar', calendar);

  calendar.$inject = [];
  function calendar() {
    var directive = {};

    directive.restrict = 'E';
    directive.replace = true;

    directive.templateUrl = 'calendar.html';

    directive.scope = {
      rangeChanged: '&',
      eventSelected: '&',
      timeSelected: '&',
      titleChanged: '&'
    };

    directive.require = ['calendar', '?^ngModel'];

    directive.link = calendarLink;
    calendarLink.$inject = [];
    function calendarLink(scope, element, attrs, ctrls) {
      var calendarCtrl = ctrls[0],
          ngModelCtrl = ctrls[1];

      if (ngModelCtrl) {
        calendarCtrl.init(ngModelCtrl);
      }
    }


    directive.controller = CalendarController;
    CalendarController.$inject = ['$scope', '$attrs', '$parse', '$interpolate', 'calendarConfig', '$timeout', '$ionicSlideBoxDelegate', 'dateFilter'];
    function CalendarController($scope, $attrs, $parse, $interpolate, calendarConfig, $timeout, $ionicSlideBoxDelegate, dateFilter) {
      var vm = this;

      console.log('$attrs', $attrs);

      var ngModelCtrl = {$setViewValue: angular.noop}; // nullModelCtrl;

      // Configuration attributes
      angular.forEach(['formatDay', 'formatDayHeader', 'formatMonthTitle', 'eventSource', 'queryMode', 'step', 'startingDayMonth'], function (key, index) {
        // vm[key] = angular.isDefined($attrs[key]) ? (index < 4 ? $interpolate($attrs[key])($scope.$parent) : $scope.$parent.$eval($attrs[key])) : calendarConfig[key];
        vm[key] = angular.isDefined($attrs[key]) ? $interpolate($attrs[key])($scope.$parent) : calendarConfig[key];
      });

      vm.hourParts = Math.floor(60 / vm.step);

      // Watch the scope of the parent scope
      $scope.$parent.$watch($attrs.eventSource, function (value) {
        vm.onEventSourceChanged(value);
      });

      if (angular.isDefined($attrs.initDate)) {
        vm.currentCalendarDate = $scope.$parent.$eval($attrs.initDate);
      }

      if (!vm.currentCalendarDate) {
        vm.currentCalendarDate = new Date();
        if ($attrs.ngModel && !$scope.$parent.$eval($attrs.ngModel)) {
          $parse($attrs.ngModel).assign($scope.$parent, vm.currentCalendarDate);
        }
      }

      function getAdjacentCalendarDate(currentCalendarDate, direction) {
        var step = vm.mode.step,
            calculateCalendarDate = new Date(currentCalendarDate),
            year = calculateCalendarDate.getFullYear() + direction * (step.years || 0),
            month = calculateCalendarDate.getMonth() + direction * (step.months || 0),
            date = calculateCalendarDate.getDate() + direction * (step.days || 0),
            firstDayInNextMonth;

        calculateCalendarDate.setFullYear(year, month, date);

        firstDayInNextMonth = new Date(year, month + 1, 1);
        if (firstDayInNextMonth.getTime() <= calculateCalendarDate.getTime()) {
          calculateCalendarDate = new Date(firstDayInNextMonth - 24 * 60 * 60 * 1000);
        }

        return calculateCalendarDate;
      }

      function getViewData(startTime) {
        function getDates(startDate, n) {
          var dates = new Array(n), current = new Date(startDate), i = 0;
          current.setHours(12); // Prevent repeated dates because of timezone bug
          while (i < n) {
            dates[i++] = new Date(current);
            current.setDate(current.getDate() + 1);
          }
          return dates;
        }
        function createDateObject(date, format) {
          return {
            date: date,
            label: dateFilter(date, format)
          };
        }

        var startDate = startTime,
            date = startDate.getDate(),
            month = (startDate.getMonth() + (date !== 1 ? 1 : 0)) % 12;

        var days = getDates(startDate, 42);
        for (var i = 0; i < 42; i++) {
          days[i] = angular.extend(createDateObject(days[i], vm.formatDay), {
            secondary: days[i].getMonth() !== month
          });
        }

        return {
          dates: days
        };
      }

      function getRange(currentDate) {
        var year = currentDate.getFullYear(),
            month = currentDate.getMonth(),
            firstDayOfMonth = new Date(year, month, 1),
            difference = vm.startingDayMonth - firstDayOfMonth.getDay(),
            numDisplayedFromPreviousMonth = (difference > 0) ? 7 - difference : -difference,
            startDate = new Date(firstDayOfMonth),
            endDate;

        if (numDisplayedFromPreviousMonth > 0) {
          startDate.setDate(-numDisplayedFromPreviousMonth + 1);
        }

        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 42);

        return {
          startTime: startDate,
          endTime: endDate
        };
      }

      function onDataLoaded() {
        var eventSource = vm.eventSource,
            len = eventSource ? eventSource.length : 0,
            startTime = vm.range.startTime,
            endTime = vm.range.endTime,
            timeZoneOffset = -new Date().getTimezoneOffset(),
            utcStartTime = new Date(startTime.getTime() + timeZoneOffset * 60 * 1000),
            utcEndTime = new Date(endTime.getTime() + timeZoneOffset * 60 * 1000),
            currentViewIndex = scope.currentViewIndex,
            dates = scope.views[currentViewIndex].dates,
            oneDay = 86400000,
            eps = 0.001;

        for (var r = 0; r < 42; r += 1) {
          if (dates[r].hasEvent) {
            dates[r].hasEvent = false;
            dates[r].events = [];
          }
        }

        for (var i = 0; i < len; i += 1) {
          var event = eventSource[i],
              eventStartTime = new Date(event.startTime),
              eventEndTime = new Date(event.endTime),
              st,
              et;

          if (event.allDay) {
            if (eventEndTime <= utcStartTime || eventStartTime >= utcEndTime) {
              continue;
            } else {
              st = utcStartTime;
              et = utcEndTime;
            }
          } else {
            if (eventEndTime <= startTime || eventStartTime >= endTime) {
              continue;
            } else {
              st = startTime;
              et = endTime;
            }
          }

          var timeDifferenceStart;
          if (eventStartTime <= st) {
            timeDifferenceStart = 0;
          } else {
            timeDifferenceStart = (eventStartTime - st) / oneDay;
          }

          var timeDifferenceEnd;
          if (eventEndTime >= et) {
            timeDifferenceEnd = (et - st) / oneDay;
          } else {
            timeDifferenceEnd = (eventEndTime - st) / oneDay;
          }

          var index = Math.floor(timeDifferenceStart);
          var eventSet;
          while (index < timeDifferenceEnd - eps) {
            dates[index].hasEvent = true;
            eventSet = dates[index].events;
            if (eventSet) {
              eventSet.push(event);
            } else {
              eventSet = [];
              eventSet.push(event);
              dates[index].events = eventSet;
            }
            index += 1;
          }
        }

        for (r = 0; r < 42; r += 1) {
          if (dates[r].hasEvent) {
            dates[r].events.sort(compareEvent);
          }
        }

        var findSelected = false;
        for (r = 0; r < 42; r += 1) {
          if (dates[r].selected) {
            scope.selectedDate = dates[r];
            findSelected = true;
            break;
          }
          if (findSelected) {
            break;
          }
        }
      }



      vm.init = function (ngModelCtrl_) {
        ngModelCtrl = ngModelCtrl_;

        ngModelCtrl.$render = function () {
          vm.render();
        };
      };

      vm.render = function () {
        if (ngModelCtrl.$modelValue) {
          var date = new Date(ngModelCtrl.$modelValue),
            isValid = !isNaN(date);

          if (isValid) {
            this.currentCalendarDate = date;
          } else {
            console.log('"ng-model" value must be a Date object, a number of milliseconds since 01.01.1970 or a string representing an RFC2822 or ISO 8601 date.');
          }
          ngModelCtrl.$setValidity('date', isValid);
        }
        this.refreshView();
      };

      vm.refreshView = function () {
        if (this.mode) {
          this.range = getRange(this.currentCalendarDate);
          if ($scope.titleChanged) {
            $scope.titleChanged({title: vm.getTitle()});
          }
          this._refreshView();
          this.rangeChanged();
        }
      };

      vm.onEventSourceChanged = function (value) {
        vm.eventSource = value;
        if (onDataLoaded) {
          onDataLoaded();
        }
      };

      vm.getAdjacentViewStartTime = function (direction) {
        var adjacentCalendarDate = getAdjacentCalendarDate(vm.currentCalendarDate, direction);
        return getRange(adjacentCalendarDate).startTime;
      };

      vm.move = function (direction) {
        vm.direction = direction;

        vm.currentCalendarDate = getAdjacentCalendarDate(vm.currentCalendarDate, direction);

        ngModelCtrl.$setViewValue(vm.currentCalendarDate);
        vm.refreshView();
        vm.direction = 0;
      };

      vm.rangeChanged = function () {
        if (vm.queryMode === 'local') {
          if (vm.eventSource && onDataLoaded) {
            onDataLoaded();
          }
        } else if (vm.queryMode === 'remote') {
          if ($scope.rangeChanged) {
            $scope.rangeChanged({
              startTime: this.range.startTime,
              endTime: this.range.endTime
            });
          }
        }
      };

      // TODO
      // => understand what is $index and what is currentViewIndex
      vm.registerSlideChanged = function (scope) {
        scope.currentViewIndex = 0;
        scope.slideChanged = function ($index) {
          $timeout(function () {
            var currentViewIndex = scope.currentViewIndex,
                direction = 0;

            console.log('currentViewIndex', currentViewIndex);
            console.log('$index', $index);

            if (currentViewIndex === $index - 1 || ($index === 0 && currentViewIndex === 2)) {
              direction = 1;
            } else if (currentViewIndex === $index + 1 || ($index === 2 && currentViewIndex === 0)) {
              direction = -1;
            }

            scope.currentViewIndex = $index;
            vm.move(direction);
            scope.$digest();
          }, 100);
        };
      };

      vm.populateAdjacentViews = function (scope) {
        var currentViewStartDate,
            currentViewData,
            toUpdateViewIndex,
            currentViewIndex = scope.currentViewIndex;

        if (vm.direction === 1) {
          currentViewStartDate = vm.getAdjacentViewStartTime(1);
          toUpdateViewIndex = (currentViewIndex + 1) % 3;
          angular.copy(getViewData(currentViewStartDate), scope.views[toUpdateViewIndex]);
        } else if (vm.direction === -1) {
          currentViewStartDate = vm.getAdjacentViewStartTime(-1);
          toUpdateViewIndex = (currentViewIndex + 2) % 3;
          angular.copy(getViewData(currentViewStartDate), scope.views[toUpdateViewIndex]);
        } else {
          if (!scope.views) {
            currentViewData = [];
            currentViewStartDate = vm.range.startTime;
            currentViewData.push(getViewData(currentViewStartDate));
            currentViewStartDate = vm.getAdjacentViewStartTime(1);
            currentViewData.push(getViewData(currentViewStartDate));
            currentViewStartDate = vm.getAdjacentViewStartTime(-1);
            currentViewData.push(getViewData(currentViewStartDate));
            scope.views = currentViewData;
          } else {
            currentViewStartDate = vm.range.startTime;
            angular.copy(getViewData(currentViewStartDate), scope.views[currentViewIndex]);
            currentViewStartDate = vm.getAdjacentViewStartTime(-1);
            toUpdateViewIndex = (currentViewIndex + 2) % 3;
            angular.copy(getViewData(currentViewStartDate), scope.views[toUpdateViewIndex]);
            currentViewStartDate = vm.getAdjacentViewStartTime(1);
            toUpdateViewIndex = (currentViewIndex + 1) % 3;
            angular.copy(getViewData(currentViewStartDate), scope.views[toUpdateViewIndex]);
          }
        }
      };

      vm.getTitle = function () {
        var currentViewStartDate = vm.range.startTime,
            date = currentViewStartDate.getDate(),
            month = (currentViewStartDate.getMonth() + (date !== 1 ? 1 : 0)) % 12,
            year = currentViewStartDate.getFullYear() + (date !== 1 && month === 0 ? 1 : 0),
            headerDate = new Date(year, month, 1);

        return dateFilter(headerDate, vm.formatMonthTitle);
      };
    }

    return directive;

  }
})();

(function() {
  'use strict';

  angular.module('directives')
    .directive('monthView', monthView);

  monthView.$inject = [];
  function monthView() {
    var directive = {};

    directive.restrict = 'E';
    directive.replace = true;
    directive.templateUrl = 'month-view.html';
    directive.require = ['^calendar', '?^ngModel'];

    directive.link = monthViewLink;

    monthViewLink.$inject = [];
    function monthViewLink(scope, element, attrs, ctrls) {

      var ctrl = ctrls[0],
          ngModelCtrl = ctrls[1];

      scope.formatDayHeader = ctrl.formatDayHeader;

      ctrl.mode = {
        step: {months: 1}
      };

      function updateCurrentView(currentViewStartDate, view) {
        var currentCalendarDate = ctrl.currentCalendarDate,
            today = new Date(),
            oneDay = 86400000,
            selectedDayDifference = Math.floor((currentCalendarDate.getTime() - currentViewStartDate.getTime()) / oneDay),
            currentDayDifference = Math.floor((today.getTime() - currentViewStartDate.getTime()) / oneDay);

        for (var r = 0; r < 42; r += 1) {
          view.dates[r].selected = false;
        }

        if (selectedDayDifference >= 0 && selectedDayDifference < 42) {
          view.dates[selectedDayDifference].selected = true;
          scope.selectedDate = view.dates[selectedDayDifference];
        } else {
          scope.selectedDate = {
            events: []
          };
        }

        if (currentDayDifference >= 0 && currentDayDifference < 42) {
          view.dates[currentDayDifference].current = true;
        }
      }

      function compareEvent(event1, event2) {
        if (event1.allDay) {
          return 1;
        } else if (event2.allDay) {
          return -1;
        } else {
          return (event1.startTime.getTime() - event2.startTime.getTime());
        }
      }

      scope.select = function (selectedDate) {
        var views = scope.views,
            dates,
            r;

        if (views) {
          dates = views[scope.currentViewIndex].dates;
          var currentCalendarDate = ctrl.currentCalendarDate;

          ctrl.currentCalendarDate = selectedDate;

          var currentViewStartDate = ctrl.range.startTime,
            oneDay = 86400000,
            selectedDayDifference = Math.floor((selectedDate.getTime() - currentViewStartDate.getTime()) / oneDay);
          for (r = 0; r < 42; r += 1) {
            dates[r].selected = false;
          }

          if (selectedDayDifference >= 0 && selectedDayDifference < 42) {
            dates[selectedDayDifference].selected = true;
            scope.selectedDate = dates[selectedDayDifference];
          }


          if (scope.timeSelected) {
            scope.timeSelected({selectedTime: selectedDate});
          }
        }
      };

      // Used to the the class depending of the event/month
      scope.getHighlightClass = function (date) {
        var className = '';

        // if has an event
        if (date.hasEvent) {
          className = date.secondary ? 'monthview-secondary' : 'monthview-primary';
          className += ' ';
        }

        // Selected date
        if (date.selected) {
          className += 'monthview-selected';
          className += ' ';
        }

        // Today date
        if (date.current) {
          className += 'monthview-current';
          className += ' ';
        }

        // From an other month
        if (date.secondary) {
          className += 'text-muted';
          className += ' ';
        }
        className = className.slice(0, -1);
        return className;
      };





      ctrl._refreshView = function () {
        ctrl.populateAdjacentViews(scope);
        updateCurrentView(ctrl.range.startTime, scope.views[scope.currentViewIndex]);
      };




      ctrl.registerSlideChanged(scope);

      ctrl.refreshView();
    }

    return directive;

  }
})();

(function() {
  angular.module('filters')
    .filter('weekNumber', weekNumber);

  weekNumber.$inject = [];

  function weekNumber() {
    return function (date) {
      date = new Date(+date);
      date.setHours(0, 0, 0, 0);
      // Thursday in current week decides the year.
      date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
      // January 4 is always in week 1.
      var week1 = new Date(date.getFullYear(), 0, 4);
      // Adjust to Thursday in week 1 and count number of weeks from date to week1.
      return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    };

  }
})();

(function() {
'use strict';

angular.module('templates', []).run(['$templateCache', function($templateCache) {
  $templateCache.put("calendar.html",
    "<div style=\"height: 100%;\">\n" +
    "  <month-view></month-view>\n" +
    "</div>\n" +
    "");
  $templateCache.put("month-view.html",
    "<div>\n" +
    "    <ion-slide-box  on-slide-changed=\"slideChanged($index)\"\n" +
    "                    does-continue=\"true\"\n" +
    "                    show-pager=\"false\"\n" +
    "                    delegate-handle=\"monthview-slide\"\n" +
    "                    style=\"height: auto;\">\n" +
    "        <ion-slide ng-repeat=\"view in views track by $index\">\n" +
    "            <table ng-if=\"$index===currentViewIndex\" class=\"table-bordered monthview-datetable\">\n" +
    "                <thead>\n" +
    "                    <tr>\n" +
    "                        <th></th>\n" +
    "                        <th ng-repeat=\"day in view.dates.slice(0,7) track by day.date\">\n" +
    "                            <small>{{::day.date | date: formatDayHeader | uppercase}}</small>\n" +
    "                        </th>\n" +
    "                    </tr>\n" +
    "                </thead>\n" +
    "                <tbody>\n" +
    "                    <tr ng-repeat=\"i in [0,1,2,3,4,5]\">\n" +
    "                        <td>SEM<br>{{view.dates[7*i].date | weekNumber}}</td>\n" +
    "                        <td ng-repeat=\"j in [0,1,2,3,4,5,6]\"\n" +
    "                            ng-click=\"select(view.dates[7*i+j].date)\"\n" +
    "                            ng-class=\"getHighlightClass(view.dates[7*i+j])\">{{view.dates[7*i+j].label}}</td>\n" +
    "                    </tr>\n" +
    "                </tbody>\n" +
    "            </table>\n" +
    "            <table ng-if=\"$index!==currentViewIndex\" class=\"table-bordered monthview-datetable\">\n" +
    "                <thead>\n" +
    "                    <tr class=\"text-center\">\n" +
    "                        <th></th>\n" +
    "                        <th ng-repeat=\"day in view.dates.slice(0,7) track by day.date\">\n" +
    "                            <small>{{::day.date | date: formatDayHeader | uppercase}}</small>\n" +
    "                        </th>\n" +
    "                    </tr>\n" +
    "                </thead>\n" +
    "                <tbody>\n" +
    "                    <tr ng-repeat=\"i in [0,1,2,3,4,5]\">\n" +
    "                        <td>SEM<br>{{view.dates[7*i].date | weekNumber}}</td>\n" +
    "                        <td ng-repeat=\"j in [0,1,2,3,4,5,6]\">{{view.dates[7*i+j].label}}</td>\n" +
    "                    </tr>\n" +
    "                </tbody>\n" +
    "            </table>\n" +
    "        </ion-slide>\n" +
    "    </ion-slide-box>\n" +
    "</div>\n" +
    "");
}]);
}());
