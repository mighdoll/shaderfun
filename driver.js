(function() {

window.start = start;


/** waves are passed to the shader
 *
 * each wave has four elements: x, y, time, hue
 * x,y are the floating point coordinates of the mouse in the range [0,1]
 * time is fractional seconds. -1 time means the wave is disabled.
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
var frozen = false;
var lastRenderMillis = 0;
var time=0.0;
var Control = function() {
  this.speed = 1.0;
  // Define render logic ...
};
var control=new Control();
var gui;
/** Setup a webgl canvas to draw with our shaders. 
 *  returns the compiled shader program and the webgl context */
function resize(gl) {
  // Get the canvas from the WebGL context
  var canvas = gl.canvas;
 
  // Lookup the size the browser is displaying the canvas.
  var displayWidth  = canvas.clientWidth;
  var displayHeight = canvas.clientHeight;
 
  // Check if the canvas is not the same size.
  if (canvas.width  != displayWidth ||
      canvas.height != displayHeight) {
 
    // Make the canvas the same size
    canvas.width  = displayWidth;
    canvas.height = displayHeight;
 
    // Set the viewport to match
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
}
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
    focus(canvas);
    return canvas;
}

function focus(elem) {
    elem.setAttribute('tabindex','0');
    elem.focus();
}

/** setup handling of mouse and keyboard events. */
function setupEvents(canvas, frameCounter) {
    var randomHue = randomMarkov(.05, .1, .5),
        mouse = setupMouse(canvas);
    setupKeys(canvas, mouse);

    function setupKeys(canvas, mouse) {
        var spaceKey = 0x20,
            rightArrow = 0x27,
            leftArrow = 0x25,
            downArrow = 0x28,
            cKey = 0x43,
            frameMillis = 1000/60;
        canvas.onkeydown = function(e) {
            if (e.keyCode == spaceKey) {
               if (frozen) {
                  frozen = false;
               } else {
                  frozen = lastRenderMillis;
               }
            } else if (e.keyCode == rightArrow && frozen) {
               frozen += frameMillis;
               frameCounter();
            } else if (e.keyCode == leftArrow && frozen) {
               frozen -= frameMillis;
               frameCounter();
            } else if (e.keyCode == downArrow) {
               addWave(mouse.mouseXY(), lastRenderMillis);
            } else if (e.keyCode == cKey) {
               clearWaves();
            } else {
              console.log(e.keyCode);
            }
         }
    }

    function addWave(mouseXY, millis) {
        var time = millis / 1000.0;
        var dropLast = waves.slice(0, waves.length - 4);
        waves = [mouseXY[0], mouseXY[1], time, randomHue()].concat(dropLast);
    }

    function setupMouse(canvas) {
        var mousedown = false,
            mouseXY = [.5, .5];

        canvas.onmousedown = function(e) {
            focus(canvas);
            saveMouse(e);
            mousedown = true;
        }
        canvas.onmouseup = function() {
            mousedown = false;
        }
        canvas.onmousemove = saveMouse;

        function saveMouse(e) {
             mouseXY = [e.clientX / window.innerHeight,
                        1 - e.clientY / window.innerHeight];
        }


        /** return a function to be called on every frame.
         *  it will start a wave if the mouse is down */
        var mouseTick = function(millis) {
            if (mousedown) {
                addWave(mouseXY, millis);
            }
        }
        tickFns.push(mouseTick);

        return {mouseXY: function() {return mouseXY; }}      
    }

}

/* disable all waves */
function clearWaves() {
    for (var i = 0; i < wavesLength * 4;) {
        waves[i++] = [0.5];
        waves[i++] = [0.5];
        waves[i++] = [-1.0];
        waves[i++] = [0.0];
    }
}

/** return a function that returns a random number in the range [0, 1].
 * The generated random number tends to stay near the previous random number, but occasionally
 * jumps to a neighborhood in [0,1].
 * 
 * @param thisState - current state random numbers will be within +/- thisState of the previous number
 * @param newStateChance - The probability of jumping to a new state
 * @param newState - new state random numbers will be within +/- newState of the previous number
 */
function randomMarkov(thisState, newStateChance, newState) {
    var markov = randomOffset();
    var value = Math.random();

    return function() {
        var offset = markov();

        value += offset;

        if (value > 1.0) {
            value = value - Math.trunc(value);
        } else if (value < 0.0) {
            value = value - Math.trunc(value) + 1;
        }

        return value;
    }

    /** return a function that returns a random number in one of two ranges. */
    function randomOffset() {
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

}

/** initialize a pretty random pattern of starting waves */
function initWaves() {
    var randomX = randomMarkov(.1, .1, .4),
        randomY = randomMarkov(.1, .1, .4),
        randomTime = randomMarkov(.5, 0),
        randomHue = randomMarkov(.05, .1, .5);
    for (var i = 0; i < wavesLength * 4;) {
        waves[i++] = [randomX()];
        waves[i++] = [randomY()];
        waves[i++] = [randomTime()];
        waves[i++] = [randomHue()];
    }
}

/** Setup one fixed wave. Useful for debugging */
function oneWave() {
   clearWaves();
   var i = 0;
   waves[i++] = .5;
   waves[i++] = .5;
   waves[i++] = 1.0;
   waves[i++] = .65;
}


function init() {
    var canvas = setupCanvas(),
        setup = setupWebGL(canvas)
        frameCounter = frameRateCounter();

    tickFns.push(function() { 
        if (!frozen) { 
          frameCounter(); 
        }
    });
    initWaves();
    // oneWave();
    setupEvents(canvas, frameCounter);
    program = setup.program;
    gl = setup.gl;
}

/** begin webgl animation */
function start() {
   var gui = new dat.GUI();
gui.add(control, 'speed', -5, 5);
    init();
    requestAnimationFrame(render);
}

/** return a function that's called with every frame rendering 
  * and will update the frame rate display */
function frameRateCounter() {
    var lastReportSecond = 0,
        framesThisSecond = 0;

    return function() {
        var millis = new Date().getTime(),
            second = Math.trunc(millis / 1000.0);
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
   resize(gl);
   time=time+(millis-lastRenderMillis)*control.speed;
    lastRenderMillis = millis;
    if (frozen) {
        millis = frozen;
    }
    tickFns.forEach(function(fn) { fn(millis);});

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform1f(program.time, time/1000.0);
    gl.uniform2f(program.resolution, window.innerWidth, window.innerHeight);
    gl.uniform4fv(program.waves, waves);

    gl.drawArrays(gl.TRIANGLES, 0, triangleVertices.length / 2);
    requestAnimationFrame(render);
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
