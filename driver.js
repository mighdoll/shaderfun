(function() {

window.start = start;

/** waves are passed to the shader
 * each wave has four elements: x, y, time, hue
 * x,y are the floating point coordinates of the mouse in the range [0,1]
 * time is fractional seconds.
 * hue is in the range [0,1]
 */
var wavesLength = 50;
var waves = []; 

var gl;
var program;

var triangleVertices = [
   -1.0, -1.0,
    1.0, -1.0, 
   -1.0,  1.0,

    1.0, -1.0,
    1.0,  1.0,
   -1.0,  1.0
];

var tickFns = [];
var freeze = false;

/** Setup a webgl canvas to draw with our shaders. 
 *  returns the compiled shader program and the webgl context */
function setupWebGL(canvas) {
    var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl"),
        shaderSourceParams = {wavesLength: wavesLength},
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
        program.waves = gl.getUniformLocation(program, "waves");
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


/** setup handling of mouse events. Returns a function that should
 * be called with every frame */
function setupEvents(canvas) {
    var currentHue = 0.0, 
        mousedown = false,
        mouseX = .5,
        mouseY = .5,
        markov = randomMarkov(.01, .1, .5);

    canvas.onmousedown = function(e) {
        saveMouse(e);
        mousedown = true;
    }
    canvas.onmouseup = function() {
        mousedown = false;
    }
    canvas.onmousemove = saveMouse;

    function saveMouse(e) {
         mouseX = e.clientX / window.innerWidth;
         mouseY = 1 - e.clientY / window.innerHeight;
    }

    /** return a function to be called on every frame.
     *  it will start a wave if the mouse is down */
    var mouseTick = function(millis) {
        if (mousedown) {
            var time = millis / 1000.0;

            currentHue += markov();
            var dropLast = waves.slice(0, waves.length - 4);
            waves = [mouseX, mouseY, time, currentHue].concat(dropLast);
        }
    }
    tickFns.push(mouseTick);
}

function setupWaves() {
    for (var i = 0; i < wavesLength * 4; i++) {
        waves[i] = [.5];
    }
}

function init() {
    var canvas = setupCanvas(),
        setup = setupWebGL(canvas);

    tickFns.push(frameRateCounter());
    setupWaves();
    setupEvents(canvas);
    program = setup.program;
    gl = setup.gl;
}

/* begin webgl animation */
function start() {
    init();
    requestAnimationFrame(render);
}

/** return a function that will update the frame rate display */
function frameRateCounter() {
    var lastReportSecond = 0;
    var framesThisSecond = 0;
    return function(millis) {
      var second = Math.trunc(millis / 1000.0);
      if (second != lastReportSecond) {
          document.getElementById("frameRate").textContent = framesThisSecond;
          lastReportSecond = second;
          framesThisSecond = 1;
      } else {
          framesThisSecond++;
      }
    };
}

/** render one frame, and repeat */
function render(millis) {
    if (freeze) {
        millis = freeze;
    }
    tickFns.forEach(function(fn) { fn(millis);});

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform1f(program.time, millis/1000.0);
    gl.uniform2f(program.resolution, window.innerWidth, window.innerHeight);
    gl.uniform4fv(program.waves, waves);

    gl.drawArrays(gl.TRIANGLES, 0, triangleVertices.length / 2);
    requestAnimationFrame(render);
}

/** return a function that returns a random number in one of two ranges. 
 * @param newStateChance - The probability of using the second range
 * @param thisState - a random number from the first range will be in [-thisState, thisState)
 * @param newState - a random number from the second range will be in [-newState, newState)
 */
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

/** Load a shader program from a DOM script element 
 *
 * @param params - key:value pairs to apply to any templates in the shader source
 */
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

}());
