// +build freebsd netbsd openbsd

package main

import(
	"fmt"
)

func openBrowser(url string) {
	// Fallback is to print out the URL to the console so that the user can bring up the web browser
	fmt.Printf("%v\n", url)
}
