// +build windows

package "godbg"

import(
	"os/exec"
)

func openBrowser(url string) {
	cmd := exec.Command("start", url)
	err = cmd.Run()
	if err != nil {
		fmt.Printf("%v\n", url)
	}
}
