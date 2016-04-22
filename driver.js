var gl;
var program;

var miceLength = 50;
var mice = [];

var triangleVertices = [
   -1.0, -1.0,
    1.0, -1.0, 
   -1.0,  1.0,

    1.0, -1.0,
    1.0,  1.0,
   -1.0,  1.0
];

function setupWebGL(canvas) {
    var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl"),
        shaderSourceParams = {miceLength: miceLength},
        program = setupShaders(gl, shaderSourceParams);

    setupModel(gl, program);
    setupUniforms(gl, program);

    return {gl:gl, program:program};

    function setupModel(gl, program) {
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(triangleVertices), gl.STATIC_DRAW);

        program.position = gl.getAttribLocation(program, "vertPosition");
        gl.enableVertexAttribArray(program.position);
        gl.vertexAttribPointer(program.position, 2, gl.FLOAT, gl.FALSE, 0, 0);
    }

    function setupUniforms(gl, program) {
        program.mice = gl.getUniformLocation(program, "mice");
        program.time = gl.getUniformLocation(program, "time");
        program.resolution = gl.getUniformLocation(program, "resolution");
    }

    function setupShaders(gl, params) {
        var vertexShader = compileShader(gl, 'shader-vs', params);
        var fragmentShader = compileShader(gl, 'shader-fs', params);

        var program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.useProgram(program);

        return program;
    }
}

function setupCanvas() {
    var canvas = document.getElementById("shader");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    return canvas;
}

var currentHue = 0.0;
function setupEvents(canvas) {
    for (var i = 0; i < miceLength * 4; i++) {
        mice[i] = [.5];
    }
    var markov = randomMarkov(.01, .1, .25);

    var mousedown = false,
        x = .5,
        y = .5;

    canvas.onmousedown = function(e) {
        saveMouse(e);
        mousedown = true;
    }
    canvas.onmouseup = function() {
        mousedown = false;
    }
    canvas.onmousemove = saveMouse;

    function saveMouse(e) {
         x = e.clientX / window.innerWidth;
         y = 1 - e.clientY / window.innerHeight;
    }

    /** return a function to be called on every frame */
    return function(millis) {
        if (mousedown) {
                time = lastFrameMillis / 1000.0;

            var dropLast = mice.slice(0, mice.length - 4);
            currentHue += markov();
            mice = [x,y,time,currentHue].concat(dropLast);
        }
    }
}

function randomMarkov(thisState, newStateChance, newState) {
    function randomFromAbs(v) {
      return (Math.random() * v * 2) - v;
    }

    return function() {
      var value;
      if (Math.random() <= newStateChance) {
         value = randomFromAbs(newState);
      } else {
        value = randomFromAbs(thisState);        
      }
      return value;
    };
}

/* begin webgl animation */
function start() {
    var canvas = setupCanvas(),
        setup = setupWebGL(canvas);

    var mouseTick = setupEvents(canvas);
    program = setup.program;
    gl = setup.gl;
    requestAnimationFrame(function(m) { render(m, mouseTick); });
}

var lastReportSecond = 0;
var framesThisSecond = 0;
function updateFrameRate(millis) {
    var second = Math.trunc(millis / 1000.0);
    if (second != lastReportSecond) {
        document.getElementById("frameRate").textContent = framesThisSecond;
        lastReportSecond = second;
        framesThisSecond = 1;
    } else {
        framesThisSecond++;
    }
}

var lastFrameMillis = 0;

/** render one frame, and repeat */
function render(millis, tickFn) {
    tickFn(millis);
    lastFrameMillis = millis;
    updateFrameRate(millis);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform1f(program.time, millis/1000.0);
    gl.uniform2f(program.resolution, window.innerWidth, window.innerHeight);
    gl.uniform4fv(program.mice, mice);

    gl.drawArrays(gl.TRIANGLES, 0, triangleVertices.length / 2);
    requestAnimationFrame(function(m) { render(m, tickFn); });
}


// Load a shader program from a DOM script element
function compileShader(gl, id, params) {
  var script = document.getElementById(id),
      rawText = collectText(script.firstChild),
      template = _.template(rawText),
      programText = template(params),
      shader = createShader(script.type);

  gl.shaderSource(shader, programText);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.log("An error occurred compiling the shader: " + gl.getShaderInfoLog(shader));
    return null;
  }

  return shader;

  function collectText(node) {
      var TEXT_NODE = 3,
          text = "";

      while (node) {
          if (node.nodeType == TEXT_NODE) {
              text += node.textContent;
          }
          node = node.nextSibling;
      }

      return text;
  }

  function createShader(mimeType) {
      if (mimeType == "x-shader/x-fragment") {
          return gl.createShader(gl.FRAGMENT_SHADER);
      } 
      if (mimeType == "x-shader/x-vertex") {
          return gl.createShader(gl.VERTEX_SHADER);
      } 

      console.log("createShader: unrecognized mime type:", mimeType);
      return undefined;
  }
}
