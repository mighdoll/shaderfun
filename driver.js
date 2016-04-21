var gl;
var program;

var miceLength = 100;
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
        program = setupShaders(gl);

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

    function setupShaders() {
        var vertexShader = compileShader(gl, 'shader-vs');
        var fragmentShader = compileShader(gl, 'shader-fs');

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

function setupEvents(canvas) {
    for (var i = 0; i < miceLength * 2; i++) {
        mice[i] = [.5];
    }

    canvas.onmousemove = function(e) {
        var x = e.clientX / window.innerWidth,
            y = 1 - e.clientY / window.innerHeight;

        var dropLast = mice.slice(0, mice.length - 2);
        mice = [x,y].concat(dropLast);
    };
}

/* begin webgl animation */
function start() {
    var canvas = setupCanvas(),
        setup = setupWebGL(canvas);

    setupEvents(canvas);
    program = setup.program;
    gl = setup.gl;
    requestAnimationFrame(render);
}

var lastFrameTime = 0;
function updateFrameRate(millis) {
    var deltaMillis = millis - lastFrameTime,
        rate = 1000.0 / deltaMillis,
        roundRate = Math.round(rate * 10) / 10.0;
    lastFrameTime = millis;
    document.getElementById("frameRate").textContent = roundRate;
}

/** render one frame, and repeat */
function render(millis) {
    updateFrameRate(millis);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform1f(program.time, millis / 1000);
    gl.uniform2f(program.resolution, window.innerWidth, window.innerHeight);
    gl.uniform2fv(program.mice, mice);

    gl.drawArrays(gl.TRIANGLES, 0, triangleVertices.length / 2);
    requestAnimationFrame(render);
}


// Load a shader program from a DOM script element
function compileShader(gl, id) {
  var script = document.getElementById(id),
      programText = collectText(script.firstChild),
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
