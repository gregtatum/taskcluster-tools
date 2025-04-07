import subprocess
from pathlib import Path

DOCS_DIR = Path("ui/docs")
OUTPUT_FILE = Path("docs-taskcluster.txt")
INCLUDE_EXTENSIONS = {".rst", ".md", ".mdx"}


def build_file_list(base_dir: Path) -> list[Path]:
    return sorted(
        [
            p
            for p in base_dir.rglob("*")
            if p.suffix in INCLUDE_EXTENSIONS and p.is_file()
        ]
    )


def build_file_tree_with_unix_tree(base_dir) -> str:
    result = subprocess.run(
        ["TREE", "."],
        cwd=base_dir,
        capture_output=True,
        text=True,
    )
    return f"{base_dir}\n" + result.stdout.strip()


def concat_files_with_headers(file_paths: list[Path], base_dir: Path) -> str:
    chunks = []

    for path in file_paths:
        relative_path = path.relative_to(base_dir)
        url_path = relative_path.with_suffix("")

        chunks.append(str(relative_path))
        chunks.append(f"https://docs.taskcluster.net/docs/{url_path}")
        chunks.append(path.read_text(encoding="utf-8"))

    return "\n\n".join(chunks)


def main():
    files = build_file_list(DOCS_DIR)
    tree = build_file_tree_with_unix_tree(DOCS_DIR)
    body = concat_files_with_headers(files, DOCS_DIR)
    OUTPUT_FILE.write_text(tree + "\n\n" + body, encoding="utf-8")


if __name__ == "__main__":
    main()
