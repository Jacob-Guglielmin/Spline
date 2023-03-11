"use strict";

const canvas = document.getElementById("canvas"),
    renderer = canvas.getContext("2d");

const presetList = document.getElementById("presetList"),
    showControlPointsContainer = document.getElementById("showControlPointsContainer"),
    showControlPointsCheckbox = document.getElementById("showControlPointsCheckbox"),
    showControlPointsLabel = document.getElementById("showControlPointsLabel"),
    controlsElement = document.getElementById("controls"),
    bottomRightContent = document.getElementById("bottomRightContent"),
    infoTitle = document.getElementById("infoTitle"),
    infoContent = document.getElementById("infoContent"),
    posValueDisplay = document.getElementById("posValueDisplay"),
    posValueSlider = document.getElementById("posValueSlider"),
    animateButton = document.getElementById("animateButton");

let curveInformation;

const config = {
    bg: "#141e2b",
    red: "#ee6c4d",
    lightblue: "#98c1d9",
    white: "#e0fbfc",
    yellow: "#ffdd55",
    pointRadius: 7,
    pointStrokeWidth: 3,
    curveWidth: 3,
    controlPointLineWidth: 2,
    hermiteArrowThickness: 3,
    velArrowThickness: 5,
    subPointRadius: 4,
    totalAnimationTimeSeconds: 5,
    arrowMultiplier: 4
};

let currentPreset = null,
    curveType = null;

let sceneChanged = true,
    animating = false;

let hoveringPoint = false;

let posValue = 1,
    posMin = 0,
    posMax = 1;

let points = [];

let pointGrabbed = null;

let lastRender = undefined;
function render(timestamp) {
    let deltaTimeSeconds = (timestamp - (lastRender || timestamp)) / 1000;
    lastRender = timestamp;

    if (sceneChanged || animating) {
        sceneChanged = false;

        renderer.clearRect(0, 0, canvas.width, canvas.height);

        if (curveType === "hermite" && showControlPointsCheckbox.checked) {
            //Render the arrows
            for (let i = 0; i < points.length; i += 2) {
                renderArrow(points[i], points[i + 1], config.red, config.hermiteArrowThickness);
            }
        } else if (curveType === "cardinal") {
            //Render dashed lines connecting endpoints to adjacent control points
            renderCurve([points[0], points[1]], config.white, config.controlPointLineWidth, true);
            renderCurve([points[points.length - 1], points[points.length - 2]], config.white, config.controlPointLineWidth, true);

            //Render autogenerated velocities if checkbox ticked
            if (showControlPointsCheckbox.checked && parseFloat(document.getElementById("cardinalSplineTensionSlider").value) !== 0) {
                let fullPoints = getCardinalSplinePoints(points, parseFloat(document.getElementById("cardinalSplineTensionSlider").value));

                for (let i = 0; i < fullPoints.length; i += 2) {
                    renderArrow(fullPoints[i], fullPoints[i + 1], config.lightblue, config.hermiteArrowThickness);
                }
            }
        } else if (curveType === "bezierCurve") {
            //Render the dashed lines between points
            renderCurve(points, config.white, config.controlPointLineWidth, true);
        } else if (curveType === "bezierSpline" && showControlPointsCheckbox.checked) {
            //Render the lines between control points
            for (let i = 1; i < points.length - 1; i++) {
                if (i % 3 === 1) {
                    renderCurve([points[i], points[i - 1]], config.lightblue, config.controlPointLineWidth, false);
                } else if (i % 3 === 2) {
                    renderCurve([points[i], points[i + 1]], config.lightblue, config.controlPointLineWidth, false);
                }
            }
        }

        if (animating) {
            posValue += (deltaTimeSeconds / config.totalAnimationTimeSeconds) * posMax;

            if (posValue > posMax) {
                posValue = posMax;
                cancelAnimation();
                if (hoveringPoint) {
                    canvas.style.cursor = "pointer";
                }
            }
        }

        //Render lerps used in calculations
        if (curveType === "bezierCurve" && posValue !== posMax) {
            //Show all the lines created by the lerps as dashed lines
            let lerpPoints = renderBezierCurveLerps(points, posValue);

            //Render the points generated
            for (let i = 0; i < lerpPoints.length; i++) {
                renderPoint(lerpPoints[i], config.subPointRadius, config.lightblue, "fill");
            }
        }

        let curveFunction;
        switch (curveType) {
            case "lerp":
                curveFunction = lerp;
                break;

            case "hermite":
                curveFunction = cubicHermiteSpline;
                break;

            case "cardinal":
                curveFunction = cardinalSpline;
                break;

            case "bezierCurve":
                curveFunction = arbitraryBezierCurve;
                break;

            case "bezierSpline":
                curveFunction = cubicBezierSpline;
                break;

            default:
                throw "Invalid curve type: " + curveType;
        }

        //Render the bezier curve up to this value
        const newPoints = [];
        for (let i = 0; i <= 500; i++) {
            newPoints.push(curveFunction(points, (posValue * i) / 500, curveType === "cardinal" ? parseFloat(document.getElementById("cardinalSplineTensionSlider").value) : undefined));
        }
        renderCurve(newPoints, config.white, config.curveWidth, false);

        //Render the control points and endpoints
        if (["lerp", "cardinal", "bezierCurve"].includes(curveType) || showControlPointsCheckbox.checked) {
            let renderEveryX = 1;

            if (curveType === "hermite") {
                renderEveryX = 2;
            }

            for (let i = 0; i < points.length; i += renderEveryX) {
                let color;

                if (curveType === "lerp") {
                    color = config.red;
                } else if (curveType === "bezierCurve") {
                    if (i === 0 || i === points.length - 1) {
                        color = config.red;
                    } else {
                        color = config.lightblue;
                    }
                } else if (curveType === "bezierSpline") {
                    if (i === 0 || i === points.length - 1) {
                        color = config.red;
                    } else if (i % 3 === 0) {
                        color = config.yellow;
                    } else {
                        color = config.lightblue;
                    }
                } else {
                    color = config.red;
                }

                renderPoint(points[i], config.pointRadius, color, "outline", config.pointStrokeWidth);
            }
        }

        if (posValue !== posMax) {
            if (curveType === "hermite" || (curveType === "bezierSpline" && currentPreset !== "bezierSplineIntro")) {
                let velocity;

                switch (curveType) {
                    case "hermite":
                        velocity = cubicHermiteSplineDerivative(points, posValue);
                        break;

                    case "bezierSpline":
                        velocity = cubicBezierSplineDerivative(points, posValue);
                        break;

                    default:
                        throw "Forgot to set up derivative for curve type: " + curveType;
                }

                let velPoint = {
                    x: newPoints[newPoints.length - 1].x + velocity.x * (curveType === "bezierSpline" ? 0.2 : 1),
                    y: newPoints[newPoints.length - 1].y + velocity.y * (curveType === "bezierSpline" ? 0.2 : 1)
                };

                renderArrow(newPoints[newPoints.length - 1], velPoint, config.white, config.velArrowThickness);
            }

            //Render the point at the end of the curve so far
            renderPoint(newPoints[newPoints.length - 1], config.pointRadius, config.red, "outline", config.pointStrokeWidth);
        }

        posValueDisplay.innerHTML = "t=" + posValue.toFixed(2);
        posValueSlider.value = posValue;
        updateSliderColors();

        if (currentPreset === "highDegreeBezier") {
            //Display the degree of the curve
            bottomRightContent.innerHTML = "Degree: " + (points.length - 1);
        }
    }

    requestAnimationFrame(render);
}

function loadPreset(preset, useElement) {
    let presetName;

    if (!useElement) {
        preset = document.getElementById(preset + "Sel");
    }

    if (preset.children.length > 0) {
        if (preset.children[0].children.length > 0) {
            preset = preset.children[0].children[0];
        } else {
            console.warn("Preset element has a child with no children - falling back to lerp preset");
            preset = document.getElementById("lerpSel");
        }
    }

    presetName = preset.id.replace("Sel", "");

    //Color the preset list appropriately to represent the current selection
    if (currentPreset !== null) {
        //Go back through selected and all parents and remove the selected class from them
        let listElement = document.getElementById(currentPreset + "Sel");
        while (true) {
            if (listElement !== null) {
                listElement.classList.remove("selected");
            }
            if (listElement.parentElement.id !== "presetList" && listElement.parentElement.parentElement.id !== "presetList") {
                listElement = listElement.parentElement.parentElement;
            } else {
                break;
            }
        }
    }
    //Go back through the new selection and all parents and add the selected class to them
    let listElement = document.getElementById(presetName + "Sel");
    while (true) {
        if (listElement !== null) {
            listElement.classList.add("selected");
        }
        if (listElement.parentElement.id !== "presetList" && listElement.parentElement.parentElement.id !== "presetList") {
            listElement = listElement.parentElement.parentElement;
        } else {
            break;
        }
    }

    let customPointData = null;
    switch (presetName) {
        case "quadraticBezier":
            customPointData = 0.8 * Math.min(canvas.width, canvas.height);
            break;
    }

    let presetPoints = JSON.parse(JSON.stringify(curveInformation[presetName].points));
    for (let point = 0; point < presetPoints.length; point++) {
        presetPoints[point].x = presetPoints[point].x.replace(/w/g, canvas.width).replace(/h/g, canvas.height);
        presetPoints[point].y = presetPoints[point].y.replace(/w/g, canvas.width).replace(/h/g, canvas.height);
        if (customPointData !== null) {
            presetPoints[point].x = presetPoints[point].x.replace(/c/g, customPointData);
            presetPoints[point].y = presetPoints[point].y.replace(/c/g, customPointData);
        }
    }

    points = presetPoints.map((x) => {
        x.x = eval(x.x);
        x.y = eval(x.y);
        return x;
    });

    curveType = curveInformation[presetName].curveType;

    if (curveType === "bezierCurve" || presetName === "lerp") {
        posValue = 1;
        posMin = 0;
        posMax = 1;
        posValueSlider.max = 1;
    } else if (curveType === "lerp") {
        posValue = points.length - 1;
        posMin = 0;
        posMax = points.length - 1;
        posValueSlider.max = posMax;
    } else if (curveType === "hermite") {
        if (points.length % 2 !== 0) throw "Invalid number of points for hermite";
        posValue = points.length / 2 - 1;
        posMin = 0;
        posMax = points.length / 2 - 1;
        posValueSlider.max = posMax;
    } else if (curveType === "cardinal") {
        posValue = points.length - 3;
        posMin = 0;
        posMax = points.length - 3;
        posValueSlider.max = posMax;
    } else if (curveType === "bezierSpline") {
        if ((points.length - 1) % 3 !== 0) throw "Invalid number of points for bezier spline";
        posValue = (points.length - 1) / 3;
        posMin = 0;
        posMax = (points.length - 1) / 3;
        posValueSlider.max = posMax;
    } else {
        throw "Forgot to set up posValue for curve type " + curveType + " with preset name " + presetName;
    }

    let movableName = "points" + (curveType === "hermite" ? " and velocity arrows" : "");
    if (curveInformation[presetName].minParts !== curveInformation[presetName].maxParts) {
        let partName = presetName !== "highDegreeBezier" ? "segment" : "point";
        controlsElement.innerHTML = "A: Add " + partName + " to end<br>D: Delete last " + partName + "<br>Drag " + movableName + " to move them";
    } else {
        controlsElement.innerHTML = "Drag " + movableName + " to move them";
    }

    infoTitle.innerText = curveInformation[presetName].infoTitle;

    let newContent = "";
    for (let i = 0; i < curveInformation[presetName].content.length; i++) {
        newContent += curveInformation[presetName].content[i];
    }
    infoContent.innerHTML = newContent;

    showControlPointsCheckbox.checked = curveType !== "cardinal";

    //Content in the bottom right box
    switch (presetName) {
        case "cardinalSpline":
            bottomRightContent.innerHTML = "Tension: <input id='cardinalSplineTensionSlider' type='range' min='0' max='1' value='0.5' step='0.01' oninput='sceneChanged = true;' list='tensionCatmullRom'>";
            break;

        case "smootheningSplines":
            //Tell the user that control points are aligned across joins
            bottomRightContent.innerHTML = "Control points are aligned across joins";
            break;

        case "smootherVelocity":
            //Tell the user that control points are mirrored across joins
            bottomRightContent.innerHTML = "Control points are mirrored across joins";
            break;

        default:
            bottomRightContent.innerHTML = "";
            break;
    }

    currentPreset = presetName;

    cancelAnimation();
    sceneChanged = true;
}

function renderBezierCurveLerps(points, t) {
    const newPoints = [];
    for (let i = 0; i < points.length - 1; i++) {
        newPoints.push(lerp(points.slice(i, i + 2), t));
    }

    renderCurve(newPoints, config.lightblue, config.controlPointLineWidth, false);

    if (newPoints.length > 2) {
        return newPoints.concat(renderBezierCurveLerps(newPoints, t));
    }

    return newPoints;
}

function renderBezierSplineLerps(points, t) {
    let splineId = Math.floor(t);

    if (splineId >= posMax) splineId = posMax - 1;

    let i = Math.min(t - splineId, 1);

    return renderBezierCurveLerps(points.slice(splineId * 3, splineId * 3 + 4), i);
}

function handleKeyPress(e) {
    if (!animating) {
        if (e.key === "a") {
            if (currentPreset === "linearSpline") {
                if (points.length < curveInformation[currentPreset].maxParts) {
                    points.push({
                        x: canvas.width / 2,
                        y: canvas.height / 2
                    });

                    posMax++;
                    posValueSlider.max = posMax;
                    if (posValue === posMax - 1) {
                        posValue = posMax;
                        posValueSlider.value = posMax;
                    }

                    sceneChanged = true;
                }
            } else if (curveType === "hermite") {
                if (points.length / 2 < curveInformation[currentPreset].maxParts) {
                    points.push(
                        {
                            x: canvas.width / 2,
                            y: (canvas.height / 7) * 3
                        },
                        {
                            x: canvas.width / 2,
                            y: (canvas.height / 7) * 4
                        }
                    );

                    posMax++;
                    posValueSlider.max = posMax;
                    if (posValue === posMax - 1) {
                        posValue = posMax;
                        posValueSlider.value = posMax;
                    }

                    sceneChanged = true;
                }
            } else if (curveType === "cardinal") {
                if (points.length - 3 < curveInformation[currentPreset].maxParts) {
                    points.push({
                        x: canvas.width / 2,
                        y: canvas.height / 2
                    });

                    posMax++;
                    posValueSlider.max = posMax;
                    if (posValue === posMax - 1) {
                        posValue = posMax;
                        posValueSlider.value = posMax;
                    }

                    sceneChanged = true;
                }
            } else if (curveType === "bezierCurve") {
                if (points.length < curveInformation[currentPreset].maxParts) {
                    points.push({
                        x: canvas.width / 2,
                        y: canvas.height / 2
                    });
                    sceneChanged = true;
                }
            } else if (curveType === "bezierSpline") {
                if ((points.length - 1) / 3 < curveInformation[currentPreset].maxParts) {
                    if (currentPreset === "bezierSplineIntro") {
                        points.push(
                            {
                                x: canvas.width / 3,
                                y: canvas.height / 2
                            },
                            {
                                x: canvas.width / 2,
                                y: canvas.height / 2
                            },
                            {
                                x: (canvas.width / 3) * 2,
                                y: canvas.height / 2
                            }
                        );
                    } else {
                        points.push(
                            {
                                x: points[points.length - 2].x,
                                y: points[points.length - 2].y
                            },
                            {
                                x: (canvas.width / 5) * 2,
                                y: canvas.height / 2
                            },
                            {
                                x: (canvas.width / 5) * 3,
                                y: canvas.height / 2
                            }
                        );
                        if (currentPreset === "smootheningSplines") {
                            enforceAlignment(points.length - 5);
                        } else {
                            enforceMirroring(points.length - 5);
                        }
                    }

                    posMax++;
                    posValueSlider.max = posMax;
                    if (posValue === posMax - 1) {
                        posValue = posMax;
                        posValueSlider.value = posMax;
                    }

                    sceneChanged = true;
                }
                return;
            }
        } else if (e.key === "d") {
            if (currentPreset === "linearSpline") {
                if (points.length > curveInformation[currentPreset].minParts) {
                    points.pop();

                    posMax--;
                    if (posValue > posMax) {
                        posValue = posMax;
                        posValueSlider.value = posMax;
                    }
                    posValueSlider.max = posMax;

                    sceneChanged = true;
                }
            } else if (curveType === "hermite") {
                if (points.length / 2 > curveInformation[currentPreset].minParts) {
                    points.splice(points.length - 2, 2);

                    posMax--;
                    if (posValue > posMax) {
                        posValue = posMax;
                        posValueSlider.value = posMax;
                    }
                    posValueSlider.max = posMax;

                    sceneChanged = true;
                }
            } else if (curveType === "cardinal") {
                if (points.length - 3 > curveInformation[currentPreset].minParts) {
                    points.pop();

                    posMax--;
                    if (posValue > posMax) {
                        posValue = posMax;
                        posValueSlider.value = posMax;
                    }
                    posValueSlider.max = posMax;

                    sceneChanged = true;
                }
            } else if (curveType === "bezierCurve") {
                if (points.length > curveInformation[currentPreset].minParts) {
                    points.pop();
                    sceneChanged = true;
                }
            } else if (curveType === "bezierSpline") {
                if ((points.length - 1) / 3 > curveInformation[currentPreset].minParts) {
                    points.splice(points.length - 3, 3);

                    posMax--;
                    if (posValue > posMax) {
                        posValue = posMax;
                        posValueSlider.value = posMax;
                    }
                    posValueSlider.max = posMax;

                    sceneChanged = true;
                }
                return;
            }
        }
    }
}

function handleMouseMove(e) {
    let pos = {
        x: e.clientX - canvas.getBoundingClientRect().left,
        y: e.clientY - canvas.getBoundingClientRect().top
    };

    if (pointGrabbed !== null) {
        const prevPos = {
            x: points[pointGrabbed].x,
            y: points[pointGrabbed].y
        };

        if (curveType === "hermite" && pointGrabbed % 2 === 1) {
            //Make it appear as though the center of the head is being dragged
            let prevPoint = points[pointGrabbed - 1];

            let angleBetween = Math.atan2(pos.y - prevPoint.y, pos.x - prevPoint.x);

            points[pointGrabbed].x = pos.x + Math.cos(angleBetween) * ((config.hermiteArrowThickness * config.arrowMultiplier * 0.8660254) / 2);
            points[pointGrabbed].y = pos.y + Math.sin(angleBetween) * ((config.hermiteArrowThickness * config.arrowMultiplier * 0.8660254) / 2);
        } else {
            points[pointGrabbed].x = pos.x;
            points[pointGrabbed].y = pos.y;
        }

        //More natural movement for curves where points are linked
        if (curveType === "hermite") {
            if (pointGrabbed % 2 === 0) {
                points[pointGrabbed + 1].x += pos.x - prevPos.x;
                points[pointGrabbed + 1].y += pos.y - prevPos.y;
            }
        } else if (curveType === "bezierSpline") {
            if (currentPreset === "smootheningSplines") {
                enforceAlignment(pointGrabbed, prevPos);
            } else if (currentPreset !== "bezierSplineIntro") {
                enforceMirroring(pointGrabbed, prevPos);
            }
        }

        sceneChanged = true;
    } else {
        let hover = identifyHover(pos);
        hoveringPoint = hover !== null;
        if (hover !== null) {
            if (!animating && (["lerp", "cardinal", "bezierCurve"].includes(curveType) || showControlPointsCheckbox.checked)) {
                canvas.style.cursor = "pointer";
            }
        } else {
            if (!animating && (["lerp", "cardinal", "bezierCurve"].includes(curveType) || showControlPointsCheckbox.checked)) {
                canvas.style.cursor = "default";
            }
        }
    }
}

function handleMouseDown(e) {
    if (!animating && (["lerp", "cardinal", "bezierCurve"].includes(curveType) || showControlPointsCheckbox.checked)) {
        let pos = {
            x: e.clientX - canvas.getBoundingClientRect().left,
            y: e.clientY - canvas.getBoundingClientRect().top
        };

        pointGrabbed = identifyHover(pos);

        if (pointGrabbed !== null) {
            points[pointGrabbed].type = "fill";
            sceneChanged = true;
        }
    }
}

function handleMouseUp(e) {
    if (!animating && (["lerp", "cardinal", "bezierCurve"].includes(curveType) || showControlPointsCheckbox.checked)) {
        if (pointGrabbed !== null) {
            points[pointGrabbed].type = "outline";
            sceneChanged = true;
        }
        pointGrabbed = null;
    }
}

function identifyHover(pos) {
    for (let i = 0; i < points.length; i++) {
        if (curveType === "hermite" && i % 2 === 1) {
            let prevPoint = points[i - 1];

            let angleBetween = Math.atan2(points[i].y - prevPoint.y, points[i].x - prevPoint.x);

            let shiftedPoint = {
                x: points[i].x - Math.cos(angleBetween) * ((config.hermiteArrowThickness * config.arrowMultiplier * 0.8660254) / 2),
                y: points[i].y - Math.sin(angleBetween) * ((config.hermiteArrowThickness * config.arrowMultiplier * 0.8660254) / 2)
            };

            if (Math.abs(shiftedPoint.x - pos.x) < config.pointRadius && Math.abs(shiftedPoint.y - pos.y) < config.pointRadius) {
                return i;
            }
        } else if (Math.abs(points[i].x - pos.x) < config.pointRadius && Math.abs(points[i].y - pos.y) < config.pointRadius) {
            return i;
        }
    }
    return null;
}

function renderCurve(points, color, width, dashed) {
    renderer.strokeStyle = color;

    renderer.lineWidth = width;

    if (dashed) {
        renderer.setLineDash([10, 15]);
    } else {
        renderer.setLineDash([]);
    }

    renderer.beginPath();
    renderer.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        renderer.lineTo(points[i].x, points[i].y);

        if (dashed) {
            renderer.stroke();
            renderer.beginPath();
            renderer.moveTo(points[i].x, points[i].y);
        }
    }
    renderer.stroke();

    renderer.setLineDash([]);
}

// Render a line up to the base edge of the triangle, then add an equilateral triangle to the end of the line so that the tip of the triangle is at to
function renderArrow(from, to, color, width) {
    renderer.strokeStyle = color;
    renderer.fillStyle = color;

    renderer.lineWidth = width;

    let triangleSideLength = width * config.arrowMultiplier;
    let triangleHeight = Math.sqrt(triangleSideLength ** 2 - (triangleSideLength / 2) ** 2);

    let angle = Math.atan2(to.y - from.y, to.x - from.x);

    renderer.beginPath();
    renderer.moveTo(from.x, from.y);
    // Use the -1 so that the line extends *just* into the triangle (prevents seam)
    renderer.lineTo(to.x - (triangleHeight - 1) * Math.cos(angle), to.y - (triangleHeight - 1) * Math.sin(angle));
    renderer.stroke();

    renderer.beginPath();
    renderer.moveTo(to.x, to.y);
    renderer.lineTo(to.x - triangleHeight * Math.cos(angle) + (triangleSideLength / 2) * Math.cos(angle + Math.PI / 2), to.y - triangleHeight * Math.sin(angle) + (triangleSideLength / 2) * Math.sin(angle + Math.PI / 2));
    renderer.lineTo(to.x - triangleHeight * Math.cos(angle) + (triangleSideLength / 2) * Math.cos(angle - Math.PI / 2), to.y - triangleHeight * Math.sin(angle) + (triangleSideLength / 2) * Math.sin(angle - Math.PI / 2));
    renderer.closePath();
    renderer.fill();
}

function renderPoint(point, size, color, fillType, strokeWidth = 3) {
    renderer.beginPath();
    renderer.arc(point.x, point.y, size, 0, Math.PI * 2);

    if (fillType === "fill") {
        renderer.fillStyle = color;
        renderer.fill();
    } else {
        renderer.fillStyle = config.bg;
        renderer.strokeStyle = color;
        renderer.lineWidth = strokeWidth;
        renderer.fill();
        renderer.stroke();
    }
}

function enforceMirroring(pointMoved, prevPos) {
    if (pointMoved !== 1 && pointMoved % 3 === 1) {
        points[pointMoved - 2] = mirroredPoint(points[pointMoved - 1], points[pointMoved]);
    } else if (pointMoved !== points.length - 2 && pointMoved % 3 === 2) {
        points[pointMoved + 2] = mirroredPoint(points[pointMoved + 1], points[pointMoved]);
    } else if (pointMoved % 3 === 0) {
        const deltaPos = { x: points[pointMoved].x - prevPos.x, y: points[pointMoved].y - prevPos.y };
        if (pointMoved !== 0) {
            points[pointMoved - 1] = { x: points[pointMoved - 1].x + deltaPos.x, y: points[pointMoved - 1].y + deltaPos.y };
        }
        if (pointMoved !== points.length - 1) {
            points[pointMoved + 1] = { x: points[pointMoved + 1].x + deltaPos.x, y: points[pointMoved + 1].y + deltaPos.y };
        }
    }
}

function enforceAlignment(pointMoved, prevPos) {
    if (pointMoved !== 1 && pointMoved % 3 === 1) {
        points[pointMoved - 2] = oppositeAngledPoint(points[pointMoved - 2], points[pointMoved - 1], points[pointMoved]);
    } else if (pointMoved !== points.length - 2 && pointMoved % 3 === 2) {
        points[pointMoved + 2] = oppositeAngledPoint(points[pointMoved + 2], points[pointMoved + 1], points[pointMoved]);
    } else if (pointMoved % 3 === 0) {
        const deltaPos = { x: points[pointMoved].x - prevPos.x, y: points[pointMoved].y - prevPos.y };
        if (pointMoved !== 0) {
            points[pointMoved - 1] = { x: points[pointMoved - 1].x + deltaPos.x, y: points[pointMoved - 1].y + deltaPos.y };
        }
        if (pointMoved !== points.length - 1) {
            points[pointMoved + 1] = { x: points[pointMoved + 1].x + deltaPos.x, y: points[pointMoved + 1].y + deltaPos.y };
        }
    }
}

function cancelAnimation() {
    animating = false;

    animateButton.innerHTML = "Animate";

    if ((curveType === "hermite" && currentPreset !== "hermiteCurve") || curveType === "cardinal" || curveType === "bezierSpline") {
        if (curveType === "hermite") {
            showControlPointsLabel.innerHTML = "Show control points and velocities";
        } else if (curveType === "cardinal") {
            showControlPointsLabel.innerHTML = "Show auto-generated velocities";
        } else {
            showControlPointsLabel.innerHTML = "Show control points";
        }

        showControlPointsContainer.style.display = "block";
    } else {
        showControlPointsContainer.style.display = "none";
    }

    controlsElement.style.display = "block";

    if (["highDegreeBezier", "cardinalSpline", "smootheningSplines", "smootherVelocity"].includes(currentPreset)) {
        bottomRightContent.style.display = "flex";
    } else {
        bottomRightContent.style.display = "none";
    }
}

function resizeCanvas() {
    let oldWidth = canvas.width;
    let oldHeight = canvas.height;

    canvas.width = canvas.getBoundingClientRect().width;
    canvas.height = canvas.getBoundingClientRect().height;

    //Scale all points so that they are in the same location as they were before the resize
    for (let i = 0; i < points.length; i++) {
        points[i].x *= canvas.width / oldWidth;
        points[i].y *= canvas.height / oldHeight;
    }

    sceneChanged = true;
}

function applyPresetListeners(element) {
    element.addEventListener("click", function (e) {
        e.stopPropagation();
        loadPreset(element, true);
    });
    if (element.children.length > 0) {
        for (let child of element.children) {
            if (child.children.length > 0) {
                for (let listElem of child.children) {
                    applyPresetListeners(listElem);
                }
            }
        }
    }
}

function updateSliderColors() {
    let posPercentage = ((posValueSlider.value - posValueSlider.min) / (posValueSlider.max - posValueSlider.min)) * 100;
    posValueSlider.style.background = "linear-gradient(to right, " + config.red + " 0%, " + config.red + " " + posPercentage + "%, " + config.lightblue + " " + posPercentage + "%, " + config.lightblue + " 100%)";

    let cardinalSplineTensionSlider = document.getElementById("cardinalSplineTensionSlider");
    if (cardinalSplineTensionSlider !== null) {
        let tensionPercentage = ((cardinalSplineTensionSlider.value - cardinalSplineTensionSlider.min) / (cardinalSplineTensionSlider.max - cardinalSplineTensionSlider.min)) * 100;
        cardinalSplineTensionSlider.style.background = "linear-gradient(to right, " + config.red + " 0%, " + config.red + " " + tensionPercentage + "%, " + config.lightblue + " " + tensionPercentage + "%, " + config.lightblue + " 100%)";
    }
}

async function getInformationFile() {
    let rawFile;
    await fetch("./assets/curveInformation.json")
        .then((response) => response.json())
        .then((data) => (rawFile = data));

    //Set up the list of presets
    presetList.innerHTML += setupPresetList(rawFile);

    //Flatten the list of presets so that it can be accessed by a single index
    curveInformation = reformatCurveInformation(rawFile);
}

function reformatCurveInformation(data) {
    let newData = {};
    for (let entry in data) {
        if (data[entry].children) {
            newData = { ...newData, ...reformatCurveInformation(data[entry].children) };
        } else {
            newData[entry] = data[entry];
        }
    }
    return newData;
}

function setupPresetList(data) {
    let toAdd = "";
    for (let entry in data) {
        toAdd += '<li id="' + entry + 'Sel">';
        toAdd += data[entry].listName;
        if (data[entry].children) {
            toAdd += "<ul>";
            toAdd += setupPresetList(data[entry].children);
            toAdd += "</ul>";
        }
        toAdd += "</li>";
    }
    return toAdd;
}

async function init() {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keypress", handleKeyPress);

    animateButton.addEventListener("click", function () {
        if (!animating) {
            showControlPointsContainer.style.display = "none";
            controlsElement.style.display = "none";
            bottomRightContent.style.display = "none";

            animateButton.innerHTML = "Stop Animation";

            animating = true;
            posValue = 0;
            pointGrabbed = null;
        } else {
            cancelAnimation();
        }
    });

    posValueSlider.addEventListener("input", function () {
        if (animating) {
            cancelAnimation();
        }
        posValue = parseFloat(posValueSlider.value);
        updateSliderColors();
        sceneChanged = true;
    });

    updateSliderColors();

    await getInformationFile();

    for (let child of presetList.children) {
        applyPresetListeners(child);
    }

    loadPreset("lerp");

    requestAnimationFrame(render);
}

init();
