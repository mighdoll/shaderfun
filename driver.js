(function() {

    window.start = start;

    /** waves are passed to the shader
     *
     * each wave has five elements: x, y, time, hue, waveType
     * x,y are the floating point coordinates of the mouse in the range [0,1]
     * time is fractional seconds. if time = -1.0 the wave is disabled.
     * hue is in the range [0,1]
     * waveType indicates what shape and how sharp to make the wave (circular, square, etc.) 
     */
    var wavesLength = 50; // length of the waves array

    var waveElements = 8;
    var waves = new Float32Array(wavesLength * waveElements);

    var gl;
    var program;

    var triangleVertices = [-1.0, -1.0,
        1.0, -1.0, -1.0, 1.0,

        1.0, -1.0,
        1.0, 1.0, -1.0, 1.0
    ];

    var tickFns = []; // arbitrary functions called on every frame
    var frozen = false; // set to millis to freeze animation at that frame
    var lastRenderMillis = 0; // true millis of previous frame, ignoring frozen-ness
    var control; // control panel state

    var decayingSineWave = .1;
    var decayingSquareWave = .2;
    var peakWave = .3;
    var mode3d = 2;
    var modeNormal = 1;

    /**  setup control panel */

    function controlPanel(randomizeFn, freezeFn) {
        var gui = new dat.GUI(),
            control = {
                speed: 1.0,
                mode: modeNormal,
                wave: decayingSineWave,
                randomize: randomizeFn,
                freeze: toFreeze,
                unfreeze: toFreeze
            };
        gui.add(control, 'speed', -5, 5);
        gui.add(control, 'mode', {
                Normal: modeNormal,
                '3D': mode3d
            });
        gui.add(control, 'wave', {
                Sine: decayingSineWave,
                Square: decayingSquareWave,
                Peak: peakWave
            });
        gui.add(control, 'randomize');
        var freezeControl = gui.add(control, 'freeze');

        return control;

        function toFreeze() {
            freezeFn();
            freezeControl.remove();

            if (frozen) {
                freezeControl = gui.add(control, 'unfreeze');
            } else {
                freezeControl = gui.add(control, 'freeze');
            }
        }
    }

    // TODO DRY with setupCanvas

    function resize(gl) {
        // Get the canvas from the WebGL context
        var canvas = gl.canvas;

        // Lookup the size the browser is displaying the canvas.
        var displayWidth = canvas.clientWidth;
        var displayHeight = canvas.clientHeight;

        // Check if the canvas is not the same size.
        if (canvas.width != displayWidth ||
            canvas.height != displayHeight) {

            // Make the canvas the same size
            canvas.width = displayWidth;
            canvas.height = displayHeight;

            // Set the viewport to match
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
    }

    /** Setup a webgl canvas to draw with our shaders. 
     *  returns the compiled shader program and the webgl context */

    function setupWebGL(canvas) {
        var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl"),
            ext = gl.getExtension("OES_texture_float"),
            shaderSourceParams = {
                wavesLength: wavesLength,
                decayingSineWave: decayingSineWave,
                decayingSquareWave: decayingSquareWave,
                peakWave: peakWave,
                modeNormal: modeNormal,
                mode3d: mode3d
            },
            program = setupShaders(gl, shaderSourceParams);

        setupModel(gl, program);
        setupUniforms(gl, program);

        return {
            gl: gl,
            program: program
        };

        function setupModel(gl, program) {
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(triangleVertices), gl.STATIC_DRAW);

            program.position = gl.getAttribLocation(program, "vertPosition");
            gl.enableVertexAttribArray(program.position);
            gl.vertexAttribPointer(program.position, 2, gl.FLOAT, gl.FALSE, 0, 0);
        }

        function setupUniforms(gl, program) {
            program.time = gl.getUniformLocation(program, "time");
            program.resolution = gl.getUniformLocation(program, "resolution");
            program.waveType = gl.getUniformLocation(program, "waveType");
            program.mode = gl.getUniformLocation(program, "mode");
            program.waveSampler = gl.getUniformLocation(program, "waveSampler");
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
        elem.setAttribute('tabindex', '0');
        elem.focus();
    }

    /** freeze animation, or unfreeze if already frozen */

    function toggleFreeze() {
        if (frozen) {
            frozen = false;
        } else {
            frozen = lastRenderMillis;
        }
    }

    /** setup handling of mouse and keyboard events. */

    function setupEvents(canvas) {
        var randomHue = randomMarkov(.05, .1, .5),
            mouse = setupMouse(canvas);
        setupKeys(canvas, mouse);

        function setupKeys(canvas, mouse) {
            var spaceKey = 0x20,
                rightArrow = 0x27,
                leftArrow = 0x25,
                downArrow = 0x28,
                cKey = 0x43,
                tKey = 0x54,
                frameMillis = 1000 / 60;
            canvas.onkeydown = function(e) {
                if (e.keyCode == spaceKey) {
                    toggleFreeze();
                } else if (e.keyCode == rightArrow && frozen) {
                    frozen += frameMillis;
                } else if (e.keyCode == leftArrow && frozen) {
                    frozen -= frameMillis;
                } else if (e.keyCode == downArrow) {
                    addWave(mouse.mouseXY(), frozen ? frozen : lastRenderMillis);
                } else if (e.keyCode == cKey) {
                    clearWaves();
                } else if (e.keyCode == tKey) {
                    oneTestWave();
                } else {
                    // console.log(e.keyCode);
                }
            }
        }

        function addWave(mouseXY, millis) {
            var time = millis / 1000.0;
            waves.copyWithin(0, waveElements);
            var newWave = new Float32Array(
                [mouseXY[0], mouseXY[1], time, randomHue(), decayingSineWave]);
            var lastDex = (wavesLength-1) * waveElements;
            waves.set(newWave, lastDex);
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
                    1 - e.clientY / window.innerHeight
                ];
            }


            /** return a function to be called on every frame.
             *  it will start a wave if the mouse is down */
            var mouseTick = function(millis) {
                if (mousedown) {
                    addWave(mouseXY, millis);
                }
            }
            tickFns.push(mouseTick);

            return {
                mouseXY: function() {
                    return mouseXY;
                }
            }
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


    /* disable all waves */

    function clearWaves() {
        for (var i = 0; i < wavesLength; i++) {
            writeWave(i, [0.5, 0.5], -1, 0.0, decayingSineWave);
        }
    }

    /** initialize a pretty random pattern of starting waves */

    function randomWaves() {
        var randomX = randomMarkov(.1, .1, .4),
            randomY = randomMarkov(.1, .1, .4),
            randomTime = randomMarkov(.5, 0),
            randomHue = randomMarkov(.05, .1, .5);
        for (var i = 0; i < wavesLength; i++) {
            writeWave(i, [randomX(), randomY()], randomTime(), randomHue(), decayingSineWave);
        }
    }

    /** Setup one fixed wave in frozen mode. Useful for debugging */

    function oneTestWave() {
        clearWaves();
        frozen = 1;
        lastRenderMillis = 1;

        for (var j = 0; j < wavesLength; j++) {
            writeWave(j, [j/10.0, .5], 1/1000.0, .65, decayingSineWave);        
        }
    }

    /** store all elements of a wave in the array. waveElements 32 bit floats. */
    function writeWave(index, position, startTime, hue, waveType) {
        var i = index * waveElements;
        waves[i++] = position[0];
        waves[i++] = position[1];
        waves[i++] = startTime;
        waves[i++] = hue;
        waves[i++] = waveType;
    }

    function init() {
        var canvas = setupCanvas(),
            setup = setupWebGL(canvas);

        randomWaves();
        setupEvents(canvas);
        control = controlPanel(randomWaves, toggleFreeze);
        program = setup.program;
        gl = setup.gl;
    }

    /** begin webgl animation */

    function start() {
        stats = new Stats();
        stats.showPanel(0);
        document.body.appendChild(stats.dom);
        init();
        requestAnimationFrame(render);
    }


    /** send current wave array to shader */
    
    function sendWaves(gl) {
        sendDataViaTexture(gl, program.wavesSampler, "wavesSampler", waves);
    }

    /** send data to shader by embedding it in a texture */

    function sendDataViaTexture(gl, uniformLocation, uniformName, floatArray) {
        var texture = createDataTexture(gl, floatArray),
            textureUnit = 0;
            
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(uniformLocation, textureUnit);
    }

    /** create wide one texel high texture to hold an array of floats.
        Note that the floats should be in the range [0,1] */

    function createDataTexture(gl, floatArray) {
        var width = floatArray.length / 4, // R,G,B,A
            height = 1,
            texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D,
           0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, floatArray);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }

    /** render one frame, and repeat */

    function render(millis) {
        stats.begin();
        resize(gl); // TODO call this on resize events, not every frame
        lastRenderMillis = millis;
        if (frozen) {
            millis = frozen;
        }
        tickFns.forEach(function(fn) {
            fn(millis);
        });

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.uniform1f(program.time, millis / 1000.0);
        gl.uniform1f(program.waveType, control.wave);
        gl.uniform1i(program.mode, control.mode);
        gl.uniform2f(program.resolution, window.innerWidth, window.innerHeight);
        sendWaves(gl);

        gl.drawArrays(gl.TRIANGLES, 0, triangleVertices.length / 2);
        stats.end();
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
            console.error("An error occurred compiling the shader: " + gl.getShaderInfoLog(shader));
            debugger;
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
