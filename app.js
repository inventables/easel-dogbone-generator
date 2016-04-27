// Define a properties array that returns array of objects representing
// the accepted properties for your application
var properties = [
  {type: 'range', id: "Notch Size", value: 0.125, min: 0, max: 0.5, step: 0.03125},
  {type: 'boolean', id: "Inside / Outside", value: false}
];

// Define a properties array that returns array of objects representing
// the accepted properties for your application

// Utilities copied from a @rodovich app
var flipPointY = function(point) {
  return [point[0], -point[1]];
};

var flipPointArraysY = function(pointArrays) {
  return pointArrays.map(function(pointArray) {
    return pointArray.map(flipPointY);
  });
};

var offsetPoint = function(point, dx, dy) {
  return [point[0] + dx, point[1] + dy];
};

var offsetPointArrays = function(pointArrays, dx, dy) {
  return pointArrays.map(function(pointArray) {
    return pointArray.map(function(point) {
      return offsetPoint(point, dx, dy);
    });
  });
};

var scale = 100000;
var lightenThreshold = 8;

var inputToClipper = function(pointArrays) {
  return pointArrays.map(function(pointArray) {
    return pointArray.map(function(point) {
      return {
        X: point[0] * scale,
        Y: point[1] * scale
      }
    });
  });
};

var formatClipperPoint = function(point) {
  return (point.X / scale).toFixed(4) + " " + (point.Y / scale).toFixed(4);
};

var clipperArea = function(polygon) {
  return ClipperLib.JS.AreaOfPolygon(polygon, scale);
};

var clipperToPath = function(pointArrays, shouldGroup, style) {
  var path = "";

  if (shouldGroup) {
    path = '<path d="';
  };

  for (var j=0; j < pointArrays.length; j++) {
    var points = pointArrays[j];
    var iteration = '';

    if (!shouldGroup) {
      iteration = '<path d="';
    };

    iteration += "M" + formatClipperPoint(points[0]);

    for (var i=1; i < points.length; i++) {
      iteration += "L" + formatClipperPoint(points[i]);
    }

    if (!shouldGroup) {
      iteration += 'Z" stroke="' + style.stroke + '" fill="' + style.fill + '" stroke-width="0.05"></path>';
    }

    path += iteration;
  }

  if (shouldGroup) {
    path += '" stroke="' + style.stroke + '" fill="' + style.fill + '" stroke-width="0.05"></path>';
  }

  return path;
}

function boolean(operation, subject, clip, isFill) {
  if(typeof isFill === 'undefined') {
    isFill = true
  }

  cpr = new ClipperLib.Clipper()
  cpr.AddPaths(subject, ClipperLib.PolyType.ptSubject, isFill)

  cpr.AddPaths(clip, ClipperLib.PolyType.ptClip, true)

  subject_fillType = ClipperLib.PolyFillType.pftNonZero
  clip_fillType = ClipperLib.PolyFillType.pftNonZero
  cpr.Execute(operation, subject, subject_fillType, clip_fillType)

  // Reclose the path
  for (var i=0; i < subject.length; i++) {
    subject[i].push(subject[i][0]);
  }

  return subject;
}

function remove(subject, clip, isFill) {
  return boolean(ClipperLib.ClipType.ctDifference, subject, clip, isFill)
}

function add(subject, clip, isFill) {
  return boolean(ClipperLib.ClipType.ctUnion, subject, clip, isFill)
}

var clipperCircle = function(x, y, radius) {
  var angle, index, middlePoints, sampleCount;
  sampleCount = 15;

  var i, ref, results;
  results = [];
  for (var index=0; index < sampleCount + 1; index++) {
    angle = 2 * Math.PI * index / sampleCount;
    results.push({
      X: scale * (x + radius * Math.cos(angle)),
      Y: scale * (y + radius * Math.sin(angle))
    });
  }
  return results;

};

function dogboneAt(paths, x, y, radius, addOrRemove) {
  var circle = clipperCircle(x, y, radius);
  if (addOrRemove) {
    return add(paths, [circle]);
  } else {
    return remove(paths, [circle])
  }
}

function angleBetween(p1, p2, p3) {
  var angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) - Math.atan2(p3[1] - p1[1], p3[0] - p1[0]);
  return angle;
}

function pointsAlmostEqual(p1, p2) {
  var threshold = 0.0001;
  return Math.abs(p1[0] - p2[0]) < threshold && Math.abs(p1[1] - p2[1]) < threshold;
}

function pointsAreUnique(p1, p2, p3) {
  return !pointsAlmostEqual(p1, p2) && !pointsAlmostEqual(p2, p3) && !pointsAlmostEqual(p1, p3);
}

function removeDuplicatePoints(points) {
  var i, lastPoint, len, point, result;
  lastPoint = points[points.length - 1];
  result = [];
  for (i = 0, len = points.length; i < len; i++) {
    point = points[i];
    if (!pointsAlmostEqual(point, lastPoint)) {
      result.push(point);
    }
    lastPoint = point;
  }
  return result;
};

function radiansToDegrees(radians) { return radians * 180 / Math.PI }

function normalizeAngle(angle) {
    var newAngle = angle;
    while (newAngle <= -180) newAngle += 360;
    while (newAngle > 180) newAngle -= 360;
    return newAngle;
}

function normalize(v) {
  var mag = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  return [v[0] / mag, v[1] / mag];
}

// Define an executor function that generates a valid SVG document string,
// and passes it to the provided success callback, or invokes the failure
// callback if unable to do so
var executor = function(args, success, failure) {
  var params = args[0];
  var input = args[1].pointArrays;

  var shapeProperties = args[1];
  var shapeWidth = shapeProperties.right - shapeProperties.left;
  var shapeHeight = shapeProperties.top - shapeProperties.bottom;
  var pointArrays = flipPointArraysY(offsetPointArrays(shapeProperties.pointArrays, -shapeProperties.left, -shapeProperties.top));

  var dogbonePoints = [];
  var clipperInput = inputToClipper(pointArrays);

  for(var i = 0; i < pointArrays.length; i++) {
    var path = removeDuplicatePoints(pointArrays[i]);
    var lastPoint = path[path.length - 1];
    var lastLastPoint = path[path.length - 2];

    for (var j = 0; j < path.length; j++) {
      var point = path[j];

      if (pointsAreUnique(point, lastPoint, lastLastPoint)) {
        var angle = angleBetween(lastLastPoint, lastPoint, point);
        var degrees = radiansToDegrees(angle);
        var normalizedAngle = normalizeAngle(degrees);

        var bisectorPoint = [(lastLastPoint[0] + point[0]) / 2, (lastLastPoint[1] + point[1]) / 2];
        var bisectorVector = [lastPoint[0] - bisectorPoint[0], lastPoint[1] - bisectorPoint[1]];
        var normalizedBisector = normalize(bisectorVector);
        var notchOffset = params["Notch Size"] / Math.sqrt(2);
        var xNotchOffset = normalizedBisector[0] * notchOffset;
        var yNotchOffset = normalizedBisector[1] * notchOffset;

        if (params["Inside / Outside"] ) {
          if (normalizedAngle > 5) {
            clipperInput = dogboneAt(clipperInput, lastPoint[0] - xNotchOffset, lastPoint[1] - yNotchOffset, params["Notch Size"], params["Inside / Outside"]);
          }
        } else {
          if (normalizedAngle < -5) {
            clipperInput = dogboneAt(clipperInput, lastPoint[0] - xNotchOffset, lastPoint[1] - yNotchOffset,  params["Notch Size"], params["Inside / Outside"]);
          }
        }
      }

      lastLastPoint = lastPoint;
      lastPoint = point;
    }
  }

  var malePath = clipperToPath(clipperInput, false, {stroke: '#000', fill: 'none'});

  var xOffset, yOffset;
  if (shapeWidth > shapeHeight) {
    yOffset = shapeHeight + params['Notch Size'];
    xOffset = 0;
  } else {
    xOffset = shapeWidth + params['Notch Size'];
    yOffset = 0;
  }

  var translation = xOffset + "," + yOffset;
  var padding = 0.25
  var expansion = padding;
  var width = shapeWidth + xOffset + 2 * expansion;
  var height = shapeHeight + yOffset  + 2 * expansion;
  var viewBox = [-expansion, -expansion, width, height].join(' ');

  var svg = [
    '<?xml version="1.0" standalone="no"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" version="1.0" width="' + width + 'in" height="' + height + 'in" viewBox="' + viewBox + '">',
    malePath,
    '</svg>'
  ].join("");

  success(svg);
};
