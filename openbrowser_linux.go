// +build linux

package main

import (
	"fmt"
	"os"
	"os/exec"
)

func openBrowser(url string) {
	if os.Getenv("DISPLAY") == "" {
		// No display means that the a browser cannot be opened automatically
		fmt.Printf("%v\n", url)
		return
	}

	if os.Getenv("SSH_CLIENT") != "" || os.Getenv("SSH_TTY") != "" {
		// SSH environment variables means that the terminal is running through an secure
		//  shell session. We want to launch the browser where the display is located,
		//  not through a X tunnel.
		fmt.Printf("%v\n", url)
		return
	}

	// Free desktop spec indicates that xdg-open should open any arbitrary provided URL
	//  on the local machine using the user's preferred browser.
	cmd := exec.Command("xdg-open", url)
	err := cmd.Run()
	if err != nil {
		fmt.Printf("%v\n", url)
	}
}
