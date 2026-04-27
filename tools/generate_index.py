import os
import sys


def generate_index(root_dir):
    html_files = []
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Filter only .html files, excluding any index.html
        html_files += [
            os.path.relpath(os.path.join(dirpath, f), root_dir)
            for f in filenames
            if f.endswith(".html") and f != "index.html"
        ]

    if html_files:
        index_file_path = os.path.join(root_dir, "index.html")
        with open(index_file_path, "w") as f:
            f.write(
                "<html><head><title>Index of "
                + os.path.basename(dirpath)
                + "</title></head><body>\n"
            )
            f.write("<h1>Contents</h1>\n<ul>\n")

            for html_file in sorted(html_files):
                f.write(f'  <li><a href="{html_file}">{html_file}</a></li>\n')

            f.write("</ul>\n</body></html>")
        print(f"Generated: {index_file_path}")


if __name__ == "__main__":
    generate_index(sys.argv[1])
