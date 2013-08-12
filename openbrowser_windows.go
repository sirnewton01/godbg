// +build windows

package main

import(
	"fmt"
	"os/exec"
)

func openBrowser(url string) {
	cmd := exec.Command("start", url)
	err = cmd.Run()
	if err != nil {
		fmt.Printf("%v\n", url)
	}
}
