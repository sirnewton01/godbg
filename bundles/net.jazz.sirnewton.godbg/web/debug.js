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
			
			document.addEventListener("keydown", myCallback(this, function(e) {
				if (this.isEnabled() && e.target.nodeName.toLowerCase() !== "input") {
					// 's' - Step
					if (e.keyCode === 83) {
						myXhr("POST", "/handle/exec/step").then(function(r) {}, handleXhrError);
					// 'n' - Next
					} else if (e.keyCode === 78) {
						myXhr("POST", "/handle/exec/next").then(function(r) {}, handleXhrError);
					// 'c' - Continue
					} else if (e.keyCode === 67) {
						myXhr("POST", "/handle/exec/continue").then(function(r) {}, handleXhrError);
					}
				}
			}));
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
			return !this.nextButton.disabled;
		}
	};
	
	executionWidget.init();
	
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
				
				selectedFrame: "0",
				
				frameWidgets: [],
				
				init: function() {
					this.row = document.createElement("tr");
					
					this.row.setAttribute("style", "vertical-align: top;");
					
					this.idElement = document.createElement("td");
					this.selectedElement = document.createElement("td");
					this.nameElement = document.createElement("td");
					this.frameElement = document.createElement("td");
					
					this.row.appendChild(this.idElement);
					this.row.appendChild(this.selectedElement);
					this.row.appendChild(this.nameElement);
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
								
								// Fill in the top-level of the stack
								this.setStack([thread.frame], false);
								
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
					
					// We are selected so now we can enable the execution controls now
					executionWidget.enable();
					
					// Fill in the stack
					myXhr("POST", "/handle/frame/stacklist", {
						ThreadId: threadId
					}).then(myCallback(this, function(result) {
						var resultObj = JSON.parse(result.response);
						var stack = resultObj.stack;
						
						this.setStack(stack, true);
					}), function(error) {
						// The error is likely an indication that this thread was not in fact
						//  stopped.
						//window.alert("ERROR: "+error.responseText);
					});
				},
				
				setStack: function(stack, threadIsSelected) {
					// TODO turn the stack frames into another widget
					var innerTable = this.frameElement.firstChild;
					
					if (innerTable) {
						this.frameElement.removeChild(innerTable);
					}
					
					this.frameWidgets = [];
					
					innerTable = document.createElement("table");
					innerTable.setAttribute("cellpadding", "0px");
					innerTable.setAttribute("cellspacing", "0px");
					innerTable.setAttribute("style", "width: 100%;");
					this.frameElement.appendChild(innerTable);

					for (var idx = 0; idx < stack.length; idx++) {
						var frame = stack[idx];
	
						var frameWidget = {
							threadWidget: this,
							frame: frame,
							frameTable: innerTable,
							threadId: this.threadId,
							row: null,

							init: function() {
								this.row = document.createElement("tr");
								var funcColumn = document.createElement("td");
								var fileColumn = document.createElement("td");
								this.row.appendChild(funcColumn);
								this.row.appendChild(fileColumn);
								funcColumn.innerHTML = frame.func;
								funcColumn.setAttribute("style", "width: 50%; padding: 0px 10px 0px 0px;");
								if (frame.file !== "") {
									var compact = document.createElement("div");
									var full = document.createElement("div");
									full.setAttribute("style", "display: none;");
									
									compact.innerHTML = this.trimFile(this.frame.file) + ":" + this.frame.line;
									full.innerHTML = this.frame.file + ":" + this.frame.line;
									
									fileColumn.appendChild(compact);
									fileColumn.appendChild(full);
									
									fileColumn.addEventListener("mouseover", function(e) {
										compact.setAttribute("style", "display: none;");
										full.setAttribute("style", "");
									});
									fileColumn.addEventListener("mouseout", function(e) {
										full.setAttribute("style", "display: none;");
										compact.setAttribute("style", "");
									});
								}
								fileColumn.setAttribute("style", "width: 50%;");
								this.frameTable.appendChild(this.row);

								this.row.addEventListener("click", myCallback(this, function(e) {
									var level = this.frame.level;
									if (!level) {
										level = 0;
									}
									
									this.threadWidget.selectedFrame = level;
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
								}), function(error) {
									// Ignore errors on the variables list.
									// TODO Should we invalidate the parent thread or frame somehow?
								});

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
									document.getElementById("fileArea").innerHTML = "";
								});
							},
							
							dispose: function() {
								this.frameTable.removeChild(this.row);
							},
							
							trimFile: function(fullpath) {
								var lastSegment = fullpath.lastIndexOf("/");
								
								if (lastSegment !== -1 && lastSegment < fullpath.length-1) {
									fullpath = fullpath.substring(lastSegment+1);
								}
								
								lastSegment = fullpath.lastIndexOf("\\");
								
								if (lastSegment !== -1 && lastSegment < fullpath.length-1) {
									fullpath = fullpath.substring(lastSegment+1);
								}
								
								return fullpath;
							}
						};

						frameWidget.init();
						
						this.frameWidgets.push(frameWidget);

						// When selecting the thread we select the previously selected
						//  frame.
						if (threadIsSelected && ""+idx === this.selectedFrame) {
							frameWidget.select();
						}
					}
				},
				
				deselect: function() {
					this.row.setAttribute("style", this.row.getAttribute("style").replace("font-weight: bold;", ""));
					
					// Remove all of the frames except for the top one
					for (var idx = 1; idx < this.frameWidgets.length; idx++) {
						this.frameWidgets[idx].dispose();
					}
					
					if (this.frameWidgets.length > 0) {
						this.frameWidgets = [this.frameWidgets[0]];
					}
				},
				
				stopped: function() {
					this.state = "stopped";
				},
				
				running: function() {
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
			}
		},
		
		selectThread: function(threadId) {
			this.selectedThread = threadId;
			
			for (var key in this.threadWidgets) {
				if (this.threadWidgets[key]) {
					this.threadWidgets[key].deselect();
					
					// If the thread is not the selected one then
					//  the frame gets reset to the top-most one
					if (key !== threadId) {
						this.threadWidgets[key].selectedFrame = "0";
					}
				}
			}
		
			var threadWidget = this.threadWidgets[threadId];
			
			if (threadWidget) {
				threadWidget.select();
			}
		},
		
		handleAllThreadsStopped: function(currentThread) {
			if (currentThread !== "all") {
				this.addThread(currentThread);
				this.selectThread(currentThread);
			}
		
			var thisWidget = this;
			
			// Get all of the threads and add them
			// TODO convert this into /handle/thread/list
			myXhr("POST", "/handle/thread/listids", {
			// TODO Fix the callback to use "this" instead of "thisWidget"
			}).then(function(result){
				var resultObj = JSON.parse(result.response);
				
				var threadIds = resultObj["thread-ids"];
				var currentThreadId = resultObj["current-thread-id"];
				
				for (var idx = 0; idx < threadIds.length; idx++) {
					thisWidget.addThread(threadIds[idx]);
				}
				
				if (currentThreadId !== "") {
					thisWidget.selectThread(currentThreadId);
				}
			}, handleXhrError);
		},
		
		handleAllThreadsRunning: function(currentThread) {
			// Time to disable the execution controls since the threads are now running.
			executionWidget.disable();
			
			this.selectedThread = "";
			
			// Remove all of the threads
			for (var threadId in this.threadWidgets) {
				if (threadId) {
					this.removeThread(threadId);
				}
			}
		},
		
		disable: function() {
		}
	};
	
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
			
			if (record.Indication === "thread-selected") {
				var threadId = record.Result.id;
				
				allThreadsWidget.selectThread(threadId);
			} else if (record.Indication === "stopped") {
				var threadId = record.Result['thread-id'];
				
				if (record.Result.reason && record.Result.reason.substring(0,6) !== "exited") {
					// All threads are stopped in all-stop mode
					allThreadsWidget.handleAllThreadsStopped(threadId);
				}
			} else if (record.Indication === "running") {
				var threadId = record.Result['thread-id'];
				
				// All threads are now running
				allThreadsWidget.handleAllThreadsRunning(threadId);
			}
		}
	};
});