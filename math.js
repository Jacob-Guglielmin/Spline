"use strict";

function lerp(points, t) {
    let segmentId = Math.floor(t);

    if (segmentId >= points.length - 1) segmentId = points.length - 2;

    let fractional = Math.min(t - segmentId, 1);

    return {
        x: points[segmentId].x + (points[segmentId + 1].x - points[segmentId].x) * fractional,
        y: points[segmentId].y + (points[segmentId + 1].y - points[segmentId].y) * fractional
    };
}

function cubicHermiteCurve(points, t) {
    let velX1 = points[1].x - points[0].x;
    let velY1 = points[1].y - points[0].y;
    let velX2 = points[3].x - points[2].x;
    let velY2 = points[3].y - points[2].y;

    return {
        x: points[0].x + t * velX1 + t ** 2 * (-3 * points[0].x + 3 * points[2].x - 2 * velX1 - velX2) + t ** 3 * (2 * points[0].x - 2 * points[2].x + velX1 + velX2),
        y: points[0].y + t * velY1 + t ** 2 * (-3 * points[0].y + 3 * points[2].y - 2 * velY1 - velY2) + t ** 3 * (2 * points[0].y - 2 * points[2].y + velY1 + velY2)
    };
}

function cubicHermiteCurveDerivative(points, t) {
    let velX1 = points[1].x - points[0].x;
    let velY1 = points[1].y - points[0].y;
    let velX2 = points[3].x - points[2].x;
    let velY2 = points[3].y - points[2].y;

    return {
        x: velX1 + 2 * t * (-3 * points[0].x + 3 * points[2].x - 2 * velX1 - velX2) + 3 * t ** 2 * (2 * points[0].x - 2 * points[2].x + velX1 + velX2),
        y: velY1 + 2 * t * (-3 * points[0].y + 3 * points[2].y - 2 * velY1 - velY2) + 3 * t ** 2 * (2 * points[0].y - 2 * points[2].y + velY1 + velY2)
    };
}

function cubicHermiteSpline(points, t) {
    let segmentId = Math.min(Math.floor(t), points.length / 2 - 2);

    let fractional = Math.min(t - segmentId, 1);

    return cubicHermiteCurve(points.slice(segmentId * 2, segmentId * 2 + 4), fractional);
}

function cubicHermiteSplineDerivative(points, t) {
    let segmentId = Math.min(Math.floor(t), points.length / 2 - 2);

    let fractional = Math.min(t - segmentId, 1);

    return cubicHermiteCurveDerivative(points.slice(segmentId * 2, segmentId * 2 + 4), fractional);
}

function getCardinalSplinePoints(points, scale) {
    let newPoints = [];
    for (let i = 1; i < points.length - 1; i++) {
        //Save point
        newPoints.push(points[i]);

        //Calculate velocity and scale magnitude by scale, then place at appropriate point on curve
        newPoints.push({
            x: (points[i + 1].x - points[i - 1].x) * scale + points[i].x,
            y: (points[i + 1].y - points[i - 1].y) * scale + points[i].y
        });
    }

    return newPoints;
}

function cardinalSpline(points, t, scale) {
    return cubicHermiteSpline(getCardinalSplinePoints(points, scale), t);
}

function arbitraryBezierCurve(points, t) {
    const newPoints = [];

    for (let i = 0; i < points.length - 1; i++) {
        newPoints.push(lerp(points.slice(i, i + 2), t));
    }

    if (newPoints.length === 1) {
        return newPoints[0];
    } else {
        return arbitraryBezierCurve(newPoints, t);
    }
}

function cubicBezierSpline(points, t) {
    let segmentId = Math.min(Math.floor(t), (points.length - 1) / 3 - 1);

    let fractional = Math.min(t - segmentId, 1);

    return {
        x: points[segmentId * 3].x + fractional * (-3 * points[segmentId * 3].x + 3 * points[segmentId * 3 + 1].x) + fractional ** 2 * (3 * points[segmentId * 3].x - 6 * points[segmentId * 3 + 1].x + 3 * points[segmentId * 3 + 2].x) + fractional ** 3 * (-points[segmentId * 3].x + 3 * points[segmentId * 3 + 1].x - 3 * points[segmentId * 3 + 2].x + points[segmentId * 3 + 3].x),
        y: points[segmentId * 3].y + fractional * (-3 * points[segmentId * 3].y + 3 * points[segmentId * 3 + 1].y) + fractional ** 2 * (3 * points[segmentId * 3].y - 6 * points[segmentId * 3 + 1].y + 3 * points[segmentId * 3 + 2].y) + fractional ** 3 * (-points[segmentId * 3].y + 3 * points[segmentId * 3 + 1].y - 3 * points[segmentId * 3 + 2].y + points[segmentId * 3 + 3].y)
    };
}

function cubicBezierSplineDerivative(points, t) {
    let segmentId = Math.min(Math.floor(t), points.length - 2);

    let fractional = Math.min(t - segmentId, 1);

    return {
        x: -3 * points[segmentId * 3].x + 3 * points[segmentId * 3 + 1].x + 2 * fractional * (3 * points[segmentId * 3].x - 6 * points[segmentId * 3 + 1].x + 3 * points[segmentId * 3 + 2].x) + 3 * fractional ** 2 * (-points[segmentId * 3].x + 3 * points[segmentId * 3 + 1].x - 3 * points[segmentId * 3 + 2].x + points[segmentId * 3 + 3].x),
        y: -3 * points[segmentId * 3].y + 3 * points[segmentId * 3 + 1].y + 2 * fractional * (3 * points[segmentId * 3].y - 6 * points[segmentId * 3 + 1].y + 3 * points[segmentId * 3 + 2].y) + 3 * fractional ** 2 * (-points[segmentId * 3].y + 3 * points[segmentId * 3 + 1].y - 3 * points[segmentId * 3 + 2].y + points[segmentId * 3 + 3].y)
    };
}

function oppositeAngledPoint(originalPosition, mirrorAcross, copyAngleFrom) {
    const intendedAngle = Math.atan2(mirrorAcross.y - copyAngleFrom.y, mirrorAcross.x - copyAngleFrom.x);

    const intendedMagnitude = Math.sqrt(Math.pow(mirrorAcross.x - originalPosition.x, 2) + Math.pow(mirrorAcross.y - originalPosition.y, 2));

    const newX = mirrorAcross.x + Math.cos(intendedAngle) * intendedMagnitude;
    const newY = mirrorAcross.y + Math.sin(intendedAngle) * intendedMagnitude;

    return { x: newX, y: newY };
}

function mirroredPoint(mirrorAcross, copyAngleFrom) {
    const intendedAngle = Math.atan2(mirrorAcross.y - copyAngleFrom.y, mirrorAcross.x - copyAngleFrom.x);
    const magnitude = Math.sqrt(Math.pow(mirrorAcross.x - copyAngleFrom.x, 2) + Math.pow(mirrorAcross.y - copyAngleFrom.y, 2));

    const newX = mirrorAcross.x + Math.cos(intendedAngle) * magnitude;
    const newY = mirrorAcross.y + Math.sin(intendedAngle) * magnitude;

    return { x: newX, y: newY };
}

/*
function addVectors(...vectors) {
    return vectors.reduce((a, b) => ({ x: a.x + b.x, y: a.y + b.y }));
}

function matrixMult(a, b) {
    const result = [];

    for (let i = 0; i < a.length; i++) {
        result[i] = [];
        for (let j = 0; j < b[0].length; j++) {
            let sum = 0;
            for (let k = 0; k < a[0].length; k++) {
                sum += a[i][k] * b[k][j];
            }
            result[i][j] = sum;
        }
    }

    return result;
}
*/
