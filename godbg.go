// Copyright 2013 Chris McGee <sirnewton_01@yahoo.ca>. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package main

import (
	"golang.org/x/net/websocket"
	"crypto/tls"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"github.com/sirnewton01/gdblib"
	"go/build"
	"io"
	"log"
	"math/rand"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type chainedFileSystem struct {
	fs []http.FileSystem
}

func (cfs chainedFileSystem) Open(name string) (http.File, error) {
	var lastIdx = len(cfs.fs) - 1

	for i := range cfs.fs {
		f, err := cfs.fs[i].Open(name)
		if i == lastIdx && err != nil {
			return nil, err
		} else if err == nil {
			return noReaddirFile{f}, nil
		}
	}

	return nil, errors.New("Algorithm failure")
}

type noReaddirFile struct {
	http.File
}

func (file noReaddirFile) Readdir(count int) ([]os.FileInfo, error) {
	return nil, nil
}

const (
	loopbackHost = "127.0.0.1"
)

var (
	srcDir    *string
	autoOpen  *bool
	gopath    string
	gopaths   []string
	goroot    string
	cwd       string
	bundleDir string

	magicKey string
	hostName string = loopbackHost
	certFile string
	keyFile  string
)

func init() {
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s [options] <executable|go package name> [arguments...]\n", os.Args[0])
		flag.PrintDefaults()
	}
	srcDir = flag.String("srcDir", "", "Location of the source code for the executable")
	autoOpen = flag.Bool("openBrowser", true, "Automatically open a web browser when possible")

	flag.Parse()

	gopath = build.Default.GOPATH
	goroot = runtime.GOROOT()
	cwd, _ = os.Getwd()

	// Search gopaths for the bundles directory for our web bundles
	gopaths = strings.Split(gopath, string(filepath.ListSeparator))
	for _, path := range gopaths {
		pathToMatch := filepath.Join(path, "/src/github.com/sirnewton01/godbg/bundles")

		_, err := os.Stat(pathToMatch)
		if err == nil {
			bundleDir = pathToMatch
		}
	}

	if os.Getenv("GOHOST") != "" {
		hostName = os.Getenv("GOHOST")

		// Make sure that we have the certificate file and key file set
		//  in environment variables
		certFile = os.Getenv("GOCERTFILE")
		keyFile = os.Getenv("GOKEYFILE")

		if certFile == "" || keyFile == "" {
			log.Fatal("Please set GOCERTFILE and GOKEYFILE environment variables to point to the TLS/SSL certificate file and key file to use for the secure connection.\n")
		}

		// Initialize the random magic key for this session
		rand.Seed(time.Now().UTC().UnixNano())
		magicKey = strconv.FormatInt(rand.Int63(), 16)
	}
}

func main() {
	if bundleDir == "" {
		log.Fatal("Please set the GOPATH that includes the godbg project and re-run.")
		return
	}

	if flag.NArg() < 1 {
		flag.Usage()
		return
	}

	execPath := flag.Arg(0)

	// Check to see if the executable path is really a go package that
	//  exists in the gopath's source directory
	if !filepath.IsAbs(execPath) {
		pkgPath := execPath
		pkgSrcDir := ""
		pkgBase := filepath.Base(pkgPath)

		for _, path := range gopaths {
			srcPathMatch := filepath.Join(path, "src", pkgPath)
			binPathMatch := filepath.Join(path, "bin", pkgBase)

			// Try to discover the src location and delete any existing binaries
			//  for this packages
			_, err := os.Stat(srcPathMatch)
			if err == nil {
				pkgSrcDir = srcPathMatch
				if *srcDir == "" {
					srcDir = &pkgSrcDir
				}

				_, err = os.Stat(binPathMatch)
				execPath = binPathMatch

				if err == nil {
					os.Remove(execPath)

					execFile, _ := os.Open(execPath)
					if execFile != nil {
						_, err := execFile.Stat()
						if err == nil {
							fmt.Fprintf(os.Stderr, "Could not clean existing binary in order to recompile with debug flags. %v\n", execPath)
							os.Exit(1)
						}
					}
				}
			}

			// Delete the "pkg" directory with any lingering archives
			os.RemoveAll(filepath.Join(path, "pkg"))
		}

		cmd := exec.Command("go", "install", "-gcflags", "-N -l", pkgPath)
		msg, err := cmd.CombinedOutput()
		if err != nil {
			fmt.Printf("Could not compile binary with debug flags: %v\n%v\n", pkgPath, string(msg))
			os.Exit(1)
		}
	}

	mygdb, err := gdblib.NewGDB(execPath, *srcDir)
	if err != nil {
		panic(err)
	}

	serverAddrChan := make(chan string)

	go func() {
		file, _ := os.Open(bundleDir)
		bundleNames, _ := file.Readdirnames(-1)
		bundleFileSystems := make([]http.FileSystem, len(bundleNames), len(bundleNames))
		for idx, bundleName := range bundleNames {
			bundleFileSystems[idx] = http.Dir(filepath.Join(bundleDir, bundleName, "web"))
		}
		cfs := chainedFileSystem{fs: bundleFileSystems}

		http.HandleFunc("/", wrapFileServer(http.FileServer(cfs)))

		http.HandleFunc("/output", wrapWebSocket(websocket.Handler(func(ws *websocket.Conn) {
			type webSockResult struct {
				Type string
				Data interface{}
			}

			for {
				select {
				case data := <-mygdb.Console:
					bytes, err := json.Marshal(&webSockResult{Type: "console", Data: data})
					if err == nil {
						_, err := ws.Write(bytes)
						if err != nil {
							fmt.Printf("Client disconnect\n")
							mygdb.GdbExit()
						}
					}
					// TODO log the marshalling error
				case data := <-mygdb.Target:
					bytes, err := json.Marshal(&webSockResult{Type: "target", Data: data})
					if err == nil {
						_, err := ws.Write(bytes)
						if err != nil {
							fmt.Printf("Client disconnect\n")
							mygdb.GdbExit()
						}
					}
					// TODO log the marshalling error
				case data := <-mygdb.InternalLog:
					bytes, err := json.Marshal(&webSockResult{Type: "gdb", Data: data})
					if err == nil {
						_, err := ws.Write(bytes)
						if err != nil {
							fmt.Printf("Client disconnect\n")
							mygdb.GdbExit()
						}
					}
					// TODO log the marshalling error
				case record := <-mygdb.AsyncResults:
					bytes, err := json.Marshal(&webSockResult{Type: "async", Data: record})
					if err == nil {
						_, err := ws.Write(bytes)
						if err != nil {
							fmt.Printf("Client disconnect\n")
							mygdb.GdbExit()
						}
					}
					// TODO log the marshalling error
				case <-time.After(30 * time.Second):
					// Send heartbeat and disconnect if client doesn't receive it
					bytes, err := json.Marshal(&webSockResult{Type: "heartbeat", Data: ""})
					if err == nil {
						_, err := ws.Write(bytes)
						if err != nil {
							fmt.Printf("Client disconnect\n")
							mygdb.GdbExit()
						}
					}
					// TODO log the marshalling error
				}
			}
		})))

		// Add handlers for each category of gdb commands (exec, breakpoint, thread, etc.)
		addExecHandlers(mygdb)
		addBreakpointHandlers(mygdb)
		addThreadHandlers(mygdb)
		addFrameHandlers(mygdb)
		addVariableHandlers(mygdb)

		http.HandleFunc("/handle/gdb/exit", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			mygdb.GdbExit()
		}))

		// Unsecure local connection through the loopback interface
		if hostName == loopbackHost {
			listener, err := net.Listen("tcp", hostName+":0")
			if err != nil {
				panic(err)
			}

			serverAddrChan <- listener.Addr().String()

			http.Serve(listener, nil)
		} else {
			// Secure connection requires a SSL/TLS cerificate and key
			config := &tls.Config{}
			if config.NextProtos == nil {
				config.NextProtos = []string{"http/1.1"}
			}

			config.Certificates = make([]tls.Certificate, 1)
			config.Certificates[0], err = tls.LoadX509KeyPair(certFile, keyFile)
			if err != nil {
				panic(err)
			}

			listener, err := tls.Listen("tcp", hostName+":0", config)
			if err != nil {
				panic(err)
			}

			serverAddrChan <- strings.Replace(listener.Addr().String(), loopbackHost, hostName, 1)

			http.Serve(listener, nil)
		}
	}()

	go func() {
		serverAddr := <-serverAddrChan
		url := ""
		if hostName != loopbackHost {
			url = "https://" + serverAddr + "/?MAGIC=" + magicKey
		} else {
			url = "http://" + serverAddr
		}

		if *autoOpen {
			openBrowser(url)
		} else {
			fmt.Printf("%v\n", url)
		}
	}()

	execArgs := flag.Args()[1:]
	mygdb.ExecArgs(gdblib.ExecArgsParms{strings.Join(execArgs, " ")})
	mygdb.ExecRun(gdblib.ExecRunParms{})

	err = mygdb.Wait()
	if err != nil {
		panic(err)
	}
}

type handlerFunc func(http.ResponseWriter, *http.Request)

func getPortFromRequest(r *http.Request) string {
	hostPort := strings.Split(r.URL.Host, ":")
	port := "443"
	if len(hostPort) == 2 {
		port = hostPort[1]
	}
	return port
}

func wrapHandlerFunc(delegate handlerFunc) handlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if hostName != loopbackHost {
			// Check the magic cookie
			// Since redirection is not generally possible here if the cookie is not
			//  present then we deny the request.

			cookie, err := r.Cookie("MAGIC" + getPortFromRequest(r))
			if err != nil || (*cookie).Value != magicKey {
				// Denied
				http.Error(w, "Permission Denied", 403)
				return
			}
		}

		delegate(w, r)
	}
}

func wrapWebSocket(delegate http.Handler) handlerFunc {
	return func(writer http.ResponseWriter, req *http.Request) {
		if hostName != loopbackHost {
			// Check the magic cookie
			// Since redirection is not generally possible if the cookie is not
			//  present then we deny the request.
			cookie, err := req.Cookie("MAGIC" + getPortFromRequest(req))
			if err != nil || (*cookie).Value != magicKey {
				// Denied
				http.Error(writer, "Permission Denied", 403)
				return
			}
		}

		delegate.ServeHTTP(writer, req)
	}
}

func wrapFileServer(delegate http.Handler) handlerFunc {
	return func(writer http.ResponseWriter, req *http.Request) {
		if hostName != loopbackHost {
			// Check for the magic cookie
			port := getPortFromRequest(req)

			cookie, err := req.Cookie("MAGIC" + port)
			if err != nil || (*cookie).Value != magicKey {
				// Check for a query parameter with the magic cookie
				// If we find it then we redirect the user's browser to set the
				//  cookie for all future requests.
				// Otherwise we return permission denied.

				magicValues := req.URL.Query()["MAGIC"]
				if len(magicValues) < 1 || magicValues[0] != magicKey {
					// Denied
					http.Error(writer, "Permission Denied", 403)
					return
				}

				// Redirect to the base URL setting the cookie
				// Cookie lasts for 1 year
				cookie := &http.Cookie{Name: "MAGIC" + port, Value: magicKey,
					Path: "/", Domain: hostName, MaxAge: 2000000,
					Secure: true, HttpOnly: false}

				http.SetCookie(writer, cookie)

				urlWithoutQuery := req.URL
				urlWithoutQuery.RawQuery = ""

				http.Redirect(writer, req, urlWithoutQuery.String(), 302)
				return
			}
		}

		delegate.ServeHTTP(writer, req)
	}
}

func addThreadHandlers(mygdb *gdblib.GDB) {
	http.HandleFunc("/handle/thread/listids", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		result, err := mygdb.ThreadListIds()

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		resultBytes, err := json.Marshal(result)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
		} else {
			w.WriteHeader(200)
			w.Write(resultBytes)
		}
	}))
	http.HandleFunc("/handle/thread/select", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.ThreadSelectParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		result, err := mygdb.ThreadSelect(parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		resultBytes, err := json.Marshal(result)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
		} else {
			w.WriteHeader(200)
			w.Write(resultBytes)
		}
	}))
	http.HandleFunc("/handle/thread/info", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.ThreadInfoParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		result, err := mygdb.ThreadInfo(parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		resultBytes, err := json.Marshal(result)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
		} else {
			w.WriteHeader(200)
			w.Write(resultBytes)
		}
	}))
}

func addFrameHandlers(mygdb *gdblib.GDB) {
	http.HandleFunc("/handle/frame/stackinfo", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		result, err := mygdb.StackInfoFrame()

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		resultBytes, err := json.Marshal(result)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
		} else {
			w.WriteHeader(200)
			w.Write(resultBytes)
		}
	}))
	http.HandleFunc("/handle/frame/stacklist", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.StackListFramesParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		result, err := mygdb.StackListFrames(parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		resultBytes, err := json.Marshal(result)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
		} else {
			w.WriteHeader(200)
			w.Write(resultBytes)
		}
	}))

	http.HandleFunc("/handle/frame/variableslist", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.StackListVariablesParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		result, err := mygdb.StackListVariables(parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		resultBytes, err := json.Marshal(result)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
		} else {
			w.WriteHeader(200)
			w.Write(resultBytes)
		}
	}))

	http.HandleFunc("/handle/file/get", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := make(map[string]string)

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		path := parms["File"]

		if path == "" {
			w.WriteHeader(400)
			w.Write([]byte("No path provided"))
			return
		}

		path, err = filepath.Abs(path)

		inGopath := false
		for _, p := range gopaths {
			if strings.HasPrefix(path, p) {
				inGopath = true
				break
			}
		}

		// If the path is not under the current directory or in the GOPATH/GOROOT then it is an illegal access
		if !inGopath &&
			!strings.HasPrefix(path, cwd) &&
			!strings.HasPrefix(path, goroot) {

			w.WriteHeader(400)
			w.Write([]byte("Illegal file access"))
			return
		}

		file, err := os.Open(path)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
		} else {
			w.WriteHeader(200)
			_, err := io.Copy(w, file)

			if err != nil {
				w.WriteHeader(500)
				w.Write([]byte(err.Error()))
			}
		}
	}))
}

func addExecHandlers(mygdb *gdblib.GDB) {
	http.HandleFunc("/handle/exec/next", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.ExecNextParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err == nil {
			err = mygdb.ExecNext(parms)
		}

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}
		w.WriteHeader(200)
	}))

	http.HandleFunc("/handle/exec/step", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.ExecStepParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err == nil {
			err = mygdb.ExecStep(parms)
		}

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}
		w.WriteHeader(200)
	}))

	http.HandleFunc("/handle/exec/continue", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.ExecContinueParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err == nil {
			err = mygdb.ExecContinue(parms)
		}

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}
		w.WriteHeader(200)
	}))

	http.HandleFunc("/handle/exec/run", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.ExecRunParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err == nil {
			err = mygdb.ExecRun(parms)
		}

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}
		w.WriteHeader(200)
	}))

	http.HandleFunc("/handle/exec/args", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.ExecArgsParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err == nil {
			err = mygdb.ExecArgs(parms)
		}

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}
		w.WriteHeader(200)
	}))

	http.HandleFunc("/handle/exec/interrupt", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.ExecInterruptParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		mygdb.ExecInterrupt(parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}
		w.WriteHeader(200)
	}))
}

func addBreakpointHandlers(mygdb *gdblib.GDB) {
	http.HandleFunc("/handle/breakpoint/list", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		result, err := mygdb.BreakList()

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
			return
		}

		resultBytes, err := json.Marshal(result)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
		} else {
			w.WriteHeader(200)
			w.Write(resultBytes)
		}
	}))

	http.HandleFunc("/handle/breakpoint/insert", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.BreakInsertParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		result, err := mygdb.BreakInsert(parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		resultBytes, err := json.Marshal(result)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
		} else {
			w.WriteHeader(200)
			w.Write(resultBytes)
		}
	}))

	http.HandleFunc("/handle/breakpoint/enable", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.BreakEnableParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		err = mygdb.BreakEnable(parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		w.WriteHeader(200)
	}))

	http.HandleFunc("/handle/breakpoint/disable", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.BreakDisableParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		err = mygdb.BreakDisable(parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		w.WriteHeader(200)
	}))
}

func addVariableHandlers(mygdb *gdblib.GDB) {
	http.HandleFunc("/handle/variable/create", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.VarCreateParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		result, err := mygdb.VarCreate(parms)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
			return
		}

		resultBytes, err := json.Marshal(result)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
		} else {
			w.WriteHeader(200)
			w.Write(resultBytes)
		}
	}))

	http.HandleFunc("/handle/variable/delete", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.VarDeleteParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		err = mygdb.VarDelete(parms)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
			return
		}

		w.WriteHeader(200)
	}))

	http.HandleFunc("/handle/variable/listchildren", wrapHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parms := gdblib.VarListChildrenParms{}

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&parms)

		if err != nil {
			w.WriteHeader(400)
			w.Write([]byte(err.Error()))
			return
		}

		result, err := mygdb.VarListChildren(parms)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
			return
		}

		resultBytes, err := json.Marshal(result)

		if err != nil {
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
		} else {
			w.WriteHeader(200)
			w.Write(resultBytes)
		}
	}))
}
