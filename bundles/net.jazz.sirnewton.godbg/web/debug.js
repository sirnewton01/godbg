// Copyright 2013 Chris McGee <sirnewton_01@yahoo.ca>. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

/*global window define document*/
/*browser:true*/

define(['orion/xhr'], function(xhr) {
	// Handle xhr errors in a uniform way
	var handleXhrError = function(e) {
		window.alert("ERROR: "+e.responseText);
	};

	// Simplified xhr call
	var myXhr = function(method, path, data) {
		if (!data) {
			data = {};
		}
		
		return xhr(method, path, {
			headers: {},
			timeout: 60000,
			data: JSON.stringify(data)
		});
	};
	
	// Callback wrapper that override 'this' for xhr and event listener
	var myCallback = function(thisPtr, func) {
		return function(arg) {
			func.call(thisPtr, arg);
		};
	};
	
	// Button click xhr callback. 'This' override, then and error are optional.
	var clickCallback = function(thisPtr, button, method, path, data, then, error) {
		if (!error) {
			error = handleXhrError;
		}
		if (!then) {
			then = function(r) {};
		}
	
		button.addEventListener("click", myCallback(thisPtr, function(e) {
			myXhr(method, path, data).then(
				myCallback(this, then), 
				myCallback(this, error));
		}));
	};
	
	var executionWidget = {		
		init: function() {
			this.nextButton = document.getElementById("next");
			this.stepButton = document.getElementById("step");
			this.continueButton = document.getElementById("continue");
			
			// Everything starts off disabled until we are on a stopped thread
			this.disable();

			clickCallback(this, this.nextButton, "POST", "/handle/exec/next");
			clickCallback(this, this.stepButton, "POST", "/handle/exec/step");
			clickCallback(this, this.continueButton, "POST", "/handle/exec/continue");
		},
		
		enable: function() {
			this.nextButton.disabled = false;
			this.stepButton.disabled = false;
			this.continueButton.disabled = false;
		},
		
		disable: function() {
			this.nextButton.disabled = true;
			this.stepButton.disabled = true;
			this.continueButton.disabled = true;
		},
		
		isEnabled: function() {
			return this.nextButton.disabled;
		}
	};
	
	executionWidget.init();
	
	var runButton = document.getElementById("run");
	var runArgsInput = document.getElementById("runArgs");
	
	var runHandler = function(e) {
		// Set the arguments and then run on the callback unless there is an
		//  error.
		myXhr("POST", "/handle/exec/args", {
			Args: runArgsInput.value
		}).then(function(result){
			myXhr("POST", "/handle/exec/run", {
			}).then(function(result){
				// TODO figure out how to better differentiate between run and continue
				//runButton.disabled = true;
			}, handleXhrError);
		}, handleXhrError);
	};
	
	runButton.addEventListener("click", runHandler);
	runArgsInput.addEventListener("keyup", function(e) {
		if (e.keyCode === 13) {
			runHandler(e);
		}
	});
	
	var interruptButton = document.getElementById("interrupt");
	clickCallback(null, interruptButton, "POST", "/handle/exec/interrupt");
	
	var exitButton = document.getElementById("exit");
	clickCallback(null, exitButton, "POST", "/handle/gdb/exit");
	
	var allVariablesWidget = {
		variablesTable: document.getElementById("variablesTable"),
		newExpressionInput: document.getElementById("addExpression"),
		
		init: function() {
			this.newExpressionInput.addEventListener("keyup", myCallback(this, function(e) {
				if (e.keyCode === 13) {
					var expression = this.newExpressionInput.value;
					
					myXhr("POST", "/handle/variable/create", {
						Expression: expression
					}).then(myCallback(this, function(result) {
						this.newExpressionInput.value = "";
						
						var resultObj = JSON.parse(result.response);
						
						this.addVariable(resultObj, expression);
					}), handleXhrError);
				}
			}));
		},
		
		setVariables: function(variables) {
			this.clearVariables();
			
			for (var idx = 0; idx < variables.length; idx++) {
				var variable = variables[idx];
				
				this.addVariable(variable);
			}
		},
		
		addVariable: function(variable, expression, parentExpression) {
			var row = document.createElement("tr");
			var nameColumn = document.createElement("td");
			var typeColumn = document.createElement("td");
			var valueColumn = document.createElement("td");
			row.appendChild(nameColumn);
			row.appendChild(typeColumn);
			row.appendChild(valueColumn);
			
			// TODO proper escaping of the values
			var name = variable.name;
			if (expression) {
				name = expression;
			} else if (parentExpression) {
				var dotIdx = name.indexOf(".");
				
				if (dotIdx !== -1) {
					name = "(" + parentExpression + ")" + name.substring(dotIdx);
				}
			}
				
			nameColumn.innerHTML = name;
			
			nameColumn.addEventListener("click", myCallback(this, function(e) {
				var exprInput = this.newExpressionInput;
				
				exprInput.value = name;
				exprInput.scrollIntoView(true);
				exprInput.focus();
			}));
			
			if (variable.type) {
				typeColumn.innerHTML = variable.type;
			}
			valueColumn.innerHTML = variable.value;
			
			this.variablesTable.appendChild(row);
			
			// We only allow one level of traversal for now.
			if (variable.numchild && variable.numchild !== "0" && !parentExpression) {				
				myXhr("POST", "/handle/variable/listchildren", {
					Name: variable.name, 
					AllValues: true
				}).then(myCallback(this, function(result){
					var resultObj = JSON.parse(result.response);
					
					for (var idx = 0; idx < resultObj.children.length; idx++) {
						this.addVariable(resultObj.children[idx], resultObj.children[idx].expr, expression);
					}
				}), handleXhrError);
			}
		},
		
		clearVariables: function() {
			var childrenToRemove = [];
			
			for (var idx = 0; idx < this.variablesTable.childNodes.length; idx++) {
				var child = this.variablesTable.childNodes[idx];
				
				if (child !== this.variablesTable.firstElementChild) {
					childrenToRemove.push(this.variablesTable.childNodes[idx]);
				}
			}
			
			for (idx = 0; idx < childrenToRemove.length; idx++) {
				this.variablesTable.removeChild(childrenToRemove[idx]);
			}
		},
		
		show: function() {
			var parentPanel = this.variablesTable.parentNode;
			
			parentPanel.setAttribute("style", parentPanel.getAttribute("style").replace("z-index: 50;", "z-index: 100;"));
			this.breakpointsWidget.hide();
		},
		
		hide: function() {
			var parentPanel = this.variablesTable.parentNode;
			
			parentPanel.setAttribute("style", parentPanel.getAttribute("style").replace("z-index: 100;", "z-index: 50;"));
		},
		
		disable: function() {
			var parentPanel = this.variablesTable.parentNode;
			
			parentPanel.setAttribute("style", parentPanel.getAttribute("style").replace("background: white;", "background: grey"));
		}
	};
	
	allVariablesWidget.init();
	
	var allThreadsWidget = {
		selectedThread: "",
		threadWidgets: {},
		threadTable: document.getElementById("threadTable"),
		
		init: function() {
		
		},
		
		addThread: function(threadId) {
			var threadWidget = this.threadWidgets[threadId];
			
			// This thread widget already exists
			if (threadWidget) {
				return;
			}
			
			threadWidget = {
				threadTable: this.threadTable,
				
				threadId: threadId,
				name: "",
				state: "",
				
				init: function() {
					this.row = document.createElement("tr");
					
					this.row.setAttribute("style", "vertical-align: top;");
					
					this.idElement = document.createElement("td");
					this.selectedElement = document.createElement("td");
					this.nameElement = document.createElement("td");
					this.stateElement = document.createElement("td");
					this.frameElement = document.createElement("td");
					
					this.row.appendChild(this.idElement);
					this.row.appendChild(this.selectedElement);
					this.row.appendChild(this.nameElement);
					this.row.appendChild(this.stateElement);
					this.row.appendChild(this.frameElement);
					
					this.idElement.innerHTML = threadId;
					
					this.threadTable.appendChild(this.row);
					
					clickCallback(this, this.row, "POST", "/handle/thread/select", {
						ThreadId: this.threadId
					}, function(result) {
						allThreadsWidget.selectThread(this.threadId);
					});
					
					// Fill in more details about the thread (name, state)
					myXhr("POST", "/handle/thread/info", {
						ThreadId: this.threadId
					}).then(myCallback(this, function(result){
						var resultObj = JSON.parse(result.response);
						
						// Even though we specify the precise thread ID we are interested in
						//  gdb will sometimes give back all of the thread information.
						
						for (var idx = 0; idx < resultObj.threads.length; idx++) {						
							var thread = resultObj.threads[idx];
							
							if (thread.id === this.threadId) {
								this.name = thread['target-id'];
								this.state = thread.state;
								
								this.nameElement.innerHTML = this.name;
								this.stateElement.innerHTML = this.state;
								
								break;
							}
						}
					}), handleXhrError);
				},
				
				dispose: function() {
					this.threadTable.removeChild(this.row);
					// TODO deregister the event listener to prevent memory leaks
				},
				
				select: function() {			
					this.row.setAttribute("style", this.row.getAttribute("style") + "font-weight: bold;");
					
					// Clear any variables in the variables view
					allVariablesWidget.clearVariables();
					
					// If this thread is stopped (or someone insists that it is selected)
					//  then try getting the list of stack frames.
					if (this.state === "stopped" || this.state === "") {
						// Also we can call to fill in the stack frames
						myXhr("POST", "/handle/frame/stacklist", {
							ThreadId: threadId
						}).then(myCallback(this, function(result) {
							// We are selected so now we can enable the execution controls
							executionWidget.enable();
							
							var resultObj = JSON.parse(result.response);
							var stack = resultObj.stack;
							
							// TODO turn the stack frames into another widget
							var innerTable = this.frameElement.firstChild;
							
							if (innerTable) {
								this.frameElement.removeChild(innerTable);
							}
							
							innerTable = document.createElement("table");
							this.frameElement.appendChild(innerTable);
							
							for (var idx = 0; idx < stack.length; idx++) {
								var frame = stack[idx];
								
								var frameWidget = {
									frame: frame,
									frameTable: innerTable,
									threadId: this.threadId,
									
									init: function() {
										var frameRow = document.createElement("tr");
										var funcColumn = document.createElement("td");
										var fileColumn = document.createElement("td");
										frameRow.appendChild(funcColumn);
										frameRow.appendChild(fileColumn);
										funcColumn.innerHTML = frame.func;
										funcColumn.setAttribute("style", "width: 30%;");
										if (frame.file !== "") {
											fileColumn.innerHTML = this.frame.file + ":" + this.frame.line;
										}
										fileColumn.setAttribute("style", "width: 70%;");
										this.frameTable.appendChild(frameRow);
										
										frameRow.addEventListener("click", myCallback(this, function(e) {
											e.stopPropagation();
											
											this.select();
										}));
									},
									
									select: function() {
										allVariablesWidget.show();
											
										myXhr("POST", "/handle/frame/variableslist", {
											AllValues: true,
											Thread: this.threadId,
											Frame: this.frame.level
										}).then(myCallback(this, function(result){
											var variables = JSON.parse(result.response).variables;
											allVariablesWidget.setVariables(variables);
										}), handleXhrError);
										
										myXhr("POST", "/handle/file/get", {
											File: this.frame.file
										}).then(myCallback(this, function(result){
											var text = result.response;
											var lines = text.split("\n");
											
											var html = "";
											
											var lineNum = parseInt(this.frame.line, 10);
											
											for (var idx = 1; idx < lines.length+1; idx++) {
												html = html + "<pre";
											
												if (idx === lineNum) {
													html = html + ' style="background-color: yellow; margin-bottom: 0px; margin-top: 0px;"';
												} else {
													html = html + ' style="margin-bottom: 0px; margin-top: 0px;"';
												}
												
												if (idx === lineNum - 10 || (idx === 0 && lineNum <= 10)) {
													html = html + ' id="scrolltoLine"';
												}
												
												html = html + ">" + idx + ": "+ lines[idx-1] + "</pre>";
											}
											
											document.getElementById("fileArea").innerHTML = html;
											document.getElementById("scrolltoLine").scrollIntoView(true);
										}), function(error) {
											//window.alert("ERROR: "+error.responseText);
										});
									}
								};
								
								frameWidget.init();
								
								// When selecting the thread we automatically select the top-most frame to show
								//  its variables, highlight the line in the file, etc.
								if (idx === 0) {
									frameWidget.select();
								}
							}
						}), function(error) {
							// The error is likely an indication that this thread was not in fact
							//  stopped.
							//window.alert("ERROR: "+error.responseText);
						});
					}
				},
				
				deselect: function() {
					this.row.setAttribute("style", this.row.getAttribute("style").replace("font-weight: bold;", ""));
				},
				
				stopped: function() {
					this.stateElement.innerHTML = "stopped";
					this.state = "stopped";
				},
				
				running: function() {
					this.stateElement.innerHTML = "running";
					this.state = "running";
					
					if (this.frameElement.firstChild) {
						this.frameElement.removeChild(this.frameElement.firstChild);
					}
				}
			};
			this.threadWidgets[threadId] = threadWidget;
			threadWidget.init();
		},
		
		removeThread: function(threadId) {
			var threadWidget = this.threadWidgets[threadId];
			
			if (threadWidget) {
				threadWidget.dispose();
				
				this.threadWidgets[threadId] = null;
				
				if (threadId === this.selectedThread) {
					this.selectedThread = "";
					executionWidget.disable();
				}
			}
		},
		
		selectThread: function(threadId) {
			this.selectedThread = threadId;
			
			for (var key in this.threadWidgets) {
				if (this.threadWidgets[key]) {
					this.threadWidgets[key].deselect();
				}
			}
			executionWidget.disable();
		
			var threadWidget = this.threadWidgets[threadId];
			
			if (threadWidget) {
				threadWidget.select();
			}
		},
		
		handleThreadStopped: function(threadId) {
			var threadWidget = this.threadWidgets[threadId];
			
			if (threadWidget) {
				threadWidget.stopped();
				
				if (this.selectedThread === "") {
				
					// No thread is currently selected. Select this one.
					myXhr("POST", "/handle/thread/select", {
						ThreadId: threadId
					}).then(function(result){
						allThreadsWidget.selectThread(threadId);
					}, handleXhrError);
				} else if (this.selectedThread === threadId) {
					// TODO this forces the frames to be updated indirectly through the thread selection mechanism. Perhaps there is a more elegant way?
					allThreadsWidget.selectThread(threadId);
				}
			}
		},
		
		handleAllThreadsStopped: function(currentThread) {
			// Mark the current thread as stopped first
			this.handleThreadStopped(currentThread);
			
			for (var threadId in this.threadWidgets) {
				if (currentThread !== threadId) {
					this.handleThreadStopped(threadId);
				}
			}
		},
		
		handleThreadRunning: function(threadId) {
			var threadWidget = this.threadWidgets[threadId];
			
			if (threadWidget) {
				threadWidget.running();
				
				// The thread we were stopped on and selected is now running.
				// Time to disable the execution controls.
				if (this.selectedThread === threadId) {
					executionWidget.disable();
				}
			}
		},
		
		handleAllThreadsRunning: function(currentThread) {
			// Mark the current thread as stopped first
			this.handleThreadRunning(currentThread);
			
			for (var threadId in this.threadWidgets) {
				if (currentThread !== threadId) {
					this.handleThreadRunning(threadId);
				}
			}
		},
		
		disable: function() {
		}
	};
	
	// Initial list of threads (if any)
	myXhr("POST", "/handle/thread/listids", {
	}).then(function(result){
		var resultObj = JSON.parse(result.response);
		
		var threadIds = resultObj["thread-ids"];
		var currentThreadId = resultObj["current-thread-id"];
		
		for (var idx = 0; idx < threadIds.length; idx++) {
			allThreadsWidget.addThread(threadIds[idx]);
		}
		
		if (currentThreadId !== "") {
			allThreadsWidget.selectThread(currentThreadId);
		}
	}, handleXhrError);
	
	var allBreakpointsWidget = {
		breakpointsTable: document.getElementById("breakpointTable"),
		addBreakpointInput: document.getElementById("addBreakpoint"),
		
		breakpointWidgets: {},
		variablesWidget: allVariablesWidget,
		
		init: function() {			
			this.addBreakpointInput.addEventListener("keyup", myCallback(this, function(e) {
				if (e.keyCode === 13) {
					myXhr("POST", "/handle/breakpoint/insert", {
						Location: this.addBreakpointInput.value
					}).then(myCallback(this, function(result){
						var resultObj = JSON.parse(result.response);
						this.addBreakpoint(resultObj.bkpt);
						this.addBreakpointInput.value = "";
					}), handleXhrError);
				}
			}));
		},
		
		addBreakpoint: function(breakpoint) {
			var breakpointWidget = this.breakpointWidgets[breakpoint.number];
			
			if (breakpointWidget) {
				return;
			}
			
			breakpointWidget = {
				breakpointsTable: this.breakpointsTable,
				id: breakpoint.number,
				enabled: breakpoint.enabled,
				
				init: function() {
					this.row = document.createElement("tr");
					this.idElement = document.createElement("td");
					this.funcElement = document.createElement("td");
					this.fileElement = document.createElement("td");
					this.lineElement = document.createElement("td");
					this.row.appendChild(this.idElement);
					this.row.appendChild(this.funcElement);
					this.row.appendChild(this.fileElement);
					this.row.appendChild(this.lineElement);
					this.idElement.innerHTML = breakpoint.number;
					this.funcElement.innerHTML = breakpoint.func;
					this.fileElement.innerHTML = breakpoint.file;
					this.lineElement.innerHTML = breakpoint.line;
					
					this.breakpointsTable.appendChild(this.row);
					
					if (this.enabled === "n") {
						this.row.setAttribute("style", "color: #C0C0C0;");
					}
					
					this.row.addEventListener("click", myCallback(this, function(e) {
						if (this.enabled === "y") {
							this.disable();
						} else {
							this.enable();
						}
					}));
				},
				
				disable: function() {
					myXhr("POST", "/handle/breakpoint/disable", {
						Breakpoints: [this.id]
					}).then(myCallback(this, function(result){
						this.row.setAttribute("style", "color: grey;");
						this.enabled = "n";
					}), function(error) {
						//window.alert("ERROR: "+error.responseText);
					});
				},
				
				enable: function() {					
					myXhr("POST", "/handle/breakpoint/enable", {
						Breakpoints: [this.id]
					}).then(myCallback(this, function(result){
						this.row.setAttribute("style", "");
						this.enabled = "y";
					}), function(error) {
						//window.alert("ERROR: "+error.responseText);
					});
				}
			};
			
			this.breakpointWidgets[breakpoint.number] = breakpointWidget;
			breakpointWidget.init();
		},
		
		show: function() {
			var parentPanel = this.breakpointsTable.parentNode;
			
			parentPanel.setAttribute("style", parentPanel.getAttribute("style").replace("z-index: 50;", "z-index: 100;"));
			this.variablesWidget.hide();
		},
		
		hide: function() {
			var parentPanel = this.breakpointsTable.parentNode;
			
			parentPanel.setAttribute("style", parentPanel.getAttribute("style").replace("z-index: 100;", "z-index: 50;"));
		},
		
		disable: function() {
			var parentPanel = this.breakpointsTable.parentNode;
			
			parentPanel.setAttribute("style", parentPanel.getAttribute("style").replace("background: white;", "background: grey"));
			
			this.addBreakpointInput.disabled = true;
		}
	};
	
	allBreakpointsWidget.init();
	allVariablesWidget.breakpointsWidget = allBreakpointsWidget;
	
	document.getElementById("showVariables").addEventListener("click", function(e) {
		allVariablesWidget.show();
	});
	document.getElementById("showBreakpoints").addEventListener("click", function(e) {
		allBreakpointsWidget.show();
	});
	
	// Initial list of breakpoints
	myXhr("POST", "/handle/breakpoint/list", {
	}).then(function(result){
		var resultObj = JSON.parse(result.response);
		
		var bps = resultObj.BreakPointTable.body;
		
		for (var idx = 0 ; idx < bps.length; idx++) {
			allBreakpointsWidget.addBreakpoint(bps[idx]);
		}
	}, handleXhrError);
	
	var outputArea = document.getElementById("outputArea");
	
	var wsUrl = document.URL.replace("http://", "ws://") + "output";
	var websocket = new WebSocket(wsUrl);
	//websocket.onopen = function(evt) {  };
	websocket.onclose = function(evt) {
		window.alert("Connection to debugger has been closed");
		
		document.body.setAttribute("style", "overflow: hidden; background: grey;");
		
		allVariablesWidget.disable();
		allBreakpointsWidget.disable();
		allThreadsWidget.disable();
		executionWidget.disable();
		runButton.disabled = true;
		interruptButton.disabled = true;
		exitButton.disabled = true;
	};
	websocket.onmessage = function(evt) {
		var event = JSON.parse(evt.data);
		var type = event.Type;
		
		// TODO decouple the console, target and gdb logs
		if (type === "console" || type === "target" || type === "gdb") {
			var message = event.Data;
			
			message = message.replace("<", "&lt;");
			message = message.replace(">", "&gt;");
			
			outputArea.innerHTML = outputArea.innerHTML + "[" + type + "] " + message;
			
			outputArea.scrollIntoView(false);
		} else if (type === "async") {
			// Asynchronous result record
			
			var record = event.Data;
			
			// Thread created event
			if (record.Indication === "thread-created") {
				var threadId = record.Result.id;
				
				allThreadsWidget.addThread(threadId);
			} else if (record.Indication === "thread-exited") {
				var threadId = record.Result.id;
				
				allThreadsWidget.removeThread(threadId);
			} else if (record.Indication === "thread-selected") {
				var threadId = record.Result.id;
				
				allThreadsWidget.selectThread(threadId);
			} else if (record.Indication === "stopped") {
				var threadId = record.Result['thread-id'];
				var stoppedThreads = record.Result['stopped-threads'];
				
				// All threads are stopped in all-stop mode
				if ((stoppedThreads && stoppedThreads === "all") || threadId === "all") {
					allThreadsWidget.handleAllThreadsStopped(threadId);
				} else {
				// In non-stop mode one thread can be stopped while the others keep running
					allThreadsWidget.handleThreadStopped(threadId);
				}
			} else if (record.Indication === "running") {
				var threadId = record.Result['thread-id'];
				var stoppedThreads = record.Result['stopped-threads'];
				
				// All threads are now running
				if ((stoppedThreads && stoppedThreads === "all") || threadId === "all") {
					allThreadsWidget.handleAllThreadsRunning(threadId);
				} else {
				// Just one thread is running
					allThreadsWidget.handleThreadRunning(threadId);
				}
			}
		}
	};
});