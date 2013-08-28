// Copyright 2013 Chris McGee <sirnewton_01@yahoo.ca>. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// +build freebsd netbsd openbsd

package main

import (
	"fmt"
)

func openBrowser(url string) {
	// Fallback is to print out the URL to the console so that the user can bring up the web browser
	fmt.Printf("%v\n", url)
}
