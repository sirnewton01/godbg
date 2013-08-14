// Copyright 2013 Chris McGee <sirnewton_01@yahoo.ca>. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

/*global window define document*/
/*browser:true*/

define(['orion/xhr'], function(xhr) {
	var executionWidget = {		
		init: function() {
			this.nextButton = document.getElementById("next");
			this.stepButton = document.getElementById("step");
			this.continueButton = document.getElementById("continue");
			
			// Everything starts off disabled until we are on a stopped thread
			this.disable();

			this.nextButton.addEventListener("click", function(e) {
				xhr("POST", "/handle/exec/next", {
					headers: {},
					timeout: 60000,
					data: "{}"
				}).then(function(result){}, function(error) {
					window.alert("ERROR: "+error.responseText);
				});
			});
			this.stepButton.addEventListener("click", function(e) {
				xhr("POST", "/handle/exec/step", {
					headers: {},
					timeout: 60000,
					data: "{}"
				}).then(function(result){}, function(error) {
					window.alert("ERROR: "+error.responseText);
				});
			});
			this.continueButton.addEventListener("click", function(e) {
				xhr("POST", "/handle/exec/continue", {
					headers: {},
					timeout: 60000,
					data: "{}"
				}).then(function(result){}, function(error) {
					window.alert("ERROR: "+error.responseText);
				});
			});
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
		xhr("POST", "/handle/exec/args", {
			headers: {},
			timeout: 60000,
			data: JSON.stringify({Args: runArgsInput.value})
		}).then(function(result){
			xhr("POST", "/handle/exec/run", {
				headers: {},
				timeout: 60000,
				data: "{}"
			}).then(function(result){
				// TODO figure out how to better differentiate between run and continue
				//runButton.disabled = true;
			}, function(error) {
				window.alert("ERROR: "+error.responseText);
			});
		}, function(error) {
			window.alert("ERROR: "+error.responseText);
		});
	};
	
	runButton.addEventListener("click", runHandler);
	runArgsInput.addEventListener("keyup", function(e) {
		if (e.keyCode === 13) {
			runHandler(e);
		}
	});
	
	var interruptButton = document.getElementById("interrupt");
	interruptButton.addEventListener("click", function(e) {
		xhr("POST", "/handle/exec/interrupt", {
			headers: {},
			timeout: 60000,
			data: "{}"
		}).then(function(result){}, function(error) {
			window.alert("ERROR: "+error.responseText);
		});
	});
	
	var exitButton = document.getElementById("exit");
	exitButton.addEventListener("click", function(e) {
		xhr("POST", "/handle/gdb/exit", {
			headers: {},
			timeout: 60000,
			data: "{}"
		}).then(function(result){
			// TODO shut down the browser window
		}, function(error) {
			window.alert("ERROR: "+error.responseText);
		});
	});
	
	var allVariablesWidget = {
		variablesTable: document.getElementById("variablesTable"),
		
		init: function() {
		},
		
		setVariables: function(variables) {
			this.clearVariables();
			
			for (var idx = 0; idx < variables.length; idx++) {
				var variable = variables[idx];
				
				var row = document.createElement("tr");
				var nameColumn = document.createElement("td");
				var valueColumn = document.createElement("td");
				row.appendChild(nameColumn);
				row.appendChild(valueColumn);
				
				// TODO proper escaping of the values
				nameColumn.innerHTML = variable.name;
				valueColumn.innerHTML = variable.value;
				
				this.variablesTable.appendChild(row);
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
					
					var thisWidget = this;
					
					this.row.addEventListener("click", function(e) {
						xhr("POST", "/handle/thread/select", {
							headers: {},
							timeout: 60000,
							data: JSON.stringify({ThreadId: thisWidget.threadId})
						}).then(function(result){
							allThreadsWidget.selectThread(thisWidget.threadId);
						}, function(error) {
							window.alert("ERROR: "+error.responseText);
						});
					});
					
					// Fill in more details about the thread (name, state)
					xhr("POST", "/handle/thread/info", {
						headers: {},
						timeout: 60000,
						data: JSON.stringify({ThreadId: this.threadId})
					}).then(function(result){
						var resultObj = JSON.parse(result.response);
						
						// Even though we specify the precise thread ID we are interested in
						//  gdb will sometimes give back all of the thread information.
						
						for (var idx = 0; idx < resultObj.threads.length; idx++) {						
							var thread = resultObj.threads[idx];
							
							if (thread.id === thisWidget.threadId) {
								thisWidget.name = thread['target-id'];
								thisWidget.state = thread.state;
								
								thisWidget.nameElement.innerHTML = thisWidget.name;
								thisWidget.stateElement.innerHTML = thisWidget.state;
								
								break;
							}
						}
					}, function(error) {
						window.alert("ERROR: "+error.responseText);
					});
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
						var thisWidget = this;
						
						// Also we can call to fill in the stack frames
						xhr("POST", "/handle/frame/stacklist", {
							headers: {},
							timeout: 60000,
							data: JSON.stringify({ThreadId: threadId})
						}).then(function(result) {
							// We are selected so now we can enable the execution controls
							executionWidget.enable();
							
							var resultObj = JSON.parse(result.response);
							var stack = resultObj.stack;
							
							// TODO turn the stack frames into another widget
							var innerTable = thisWidget.frameElement.firstChild;
							
							if (innerTable) {
								thisWidget.frameElement.removeChild(innerTable);
							}
							
							innerTable = document.createElement("table");
							thisWidget.frameElement.appendChild(innerTable);
							
							for (var idx = 0; idx < stack.length; idx++) {
								var frame = stack[idx];
								
								var frameWidget = {
									frame: frame,
									frameTable: innerTable,
									threadId: thisWidget.threadId,
									
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
										
										var thisWidget = this;
										
										frameRow.addEventListener("click", function(e) {
											e.stopPropagation();
											
											thisWidget.select();
										});
									},
									
									select: function() {
										var thisWidget = this;
										allVariablesWidget.show();
											
										xhr("POST", "/handle/frame/variableslist", {
											headers: {},
											timeout: 60000,
											data: JSON.stringify({AllValues: true, Thread: this.threadId, Frame: this.frame.level})
										}).then(function(result){
											var variables = JSON.parse(result.response).variables;
											allVariablesWidget.setVariables(variables);
										}, function(error) {
											window.alert("ERROR: "+error.responseText);
										});
										
										xhr("POST", "/handle/file/get", {
											headers: {},
											timeout: 60000,
											data: JSON.stringify({File: this.frame.file})
										}).then(function(result){
											var text = result.response;
											var lines = text.split("\n");
											
											var html = "";
											
											var lineNum = parseInt(thisWidget.frame.line, 10);
											
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
										}, function(error) {
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
						}, function(error) {
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
				this.threadWidgets[key].deselect();
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
					xhr("POST", "/handle/thread/select", {
						headers: {},
						timeout: 60000,
						data: JSON.stringify({ThreadId: threadId})
					}).then(function(result){
						allThreadsWidget.selectThread(threadId);
					}, function(error) {
						window.alert("ERROR: "+error.responseText);
					});
				} else if (this.selectedThread === threadId) {
					// TODO this forces the frames to be updated indirectly through the thread selection mechanism. Perhaps there is a more elegant way?
					allThreadsWidget.selectThread(threadId);
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
		
		disable: function() {
		}
	};
	
	// Initial list of threads (if any)
	xhr("POST", "/handle/thread/listids", {
		headers: {},
		timeout: 60000,
		data: "{}"
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
	}, function(error) {
		window.alert("ERROR: "+error.responseText);
	});
	
	var allBreakpointsWidget = {
		breakpointsTable: document.getElementById("breakpointTable"),
		addBreakpointInput: document.getElementById("addBreakpoint"),
		
		breakpointWidgets: {},
		variablesWidget: allVariablesWidget,
		
		init: function() {
			var thisWidget = this;
			
			this.addBreakpointInput.addEventListener("keyup", function(e) {
				if (e.keyCode === 13) {
					xhr("POST", "/handle/breakpoint/insert", {
						headers: {},
						timeout: 60000,
						data: JSON.stringify({Location: thisWidget.addBreakpointInput.value})
					}).then(function(result){
						var resultObj = JSON.parse(result.response);
						thisWidget.addBreakpoint(resultObj.bkpt);
						thisWidget.addBreakpointInput.value = "";
					}, function(error) {
						window.alert("ERROR: "+error.responseText);
					});
				}
			});
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
					
					var thisWidget = this;
					this.row.addEventListener("click", function(e) {
						if (thisWidget.enabled === "y") {
							thisWidget.disable();
						} else {
							thisWidget.enable();
						}
					});
				},
				
				disable: function() {
					var thisWidget = this;
					
					xhr("POST", "/handle/breakpoint/disable", {
						headers: {},
						timeout: 60000,
						data: JSON.stringify({Breakpoints: [this.id]})
					}).then(function(result){
						thisWidget.row.setAttribute("style", "color: grey;");
						thisWidget.enabled = "n";
					}, function(error) {
						//window.alert("ERROR: "+error.responseText);
					});
				},
				
				enable: function() {					
					var thisWidget = this;
					
					xhr("POST", "/handle/breakpoint/enable", {
						headers: {},
						timeout: 60000,
						data: JSON.stringify({Breakpoints: [this.id]})
					}).then(function(result){
						thisWidget.row.setAttribute("style", "");
						thisWidget.enabled = "y";
					}, function(error) {
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
	xhr("POST", "/handle/breakpoint/list", {
		headers: {},
		timeout: 60000,
		data: "{}"
	}).then(function(result){
		var resultObj = JSON.parse(result.response);
		
		var bps = resultObj.BreakPointTable.body;
		
		for (var idx = 0 ; idx < bps.length; idx++) {
			allBreakpointsWidget.addBreakpoint(bps[idx]);
		}
	}, function(error) {
		window.alert("ERROR: "+error.responseText);
	});
	
	var outputArea = document.getElementById("outputArea");
	
	var websocket = new WebSocket("ws://127.0.0.1:2023/output");
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
				
				allThreadsWidget.handleThreadStopped(threadId);
			} else if (record.Indication === "running") {
				var threadId = record.Result['thread-id'];
				
				allThreadsWidget.handleThreadRunning(threadId);
			}
		}
	};
});