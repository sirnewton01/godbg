// Copyright 2013 Chris McGee <sirnewton_01@yahoo.ca>. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// +build windows

package main

import(
	"fmt"
	"os/exec"
)

func openBrowser(url string) {
	cmd := exec.Command("cmd", "/c", "start", url)
	err = cmd.Run()
	if err != nil {
		fmt.Printf("%v\n", url)
	}
}
