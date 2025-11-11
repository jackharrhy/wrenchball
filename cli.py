import httpx
import shutil
import typer
import zipfile
from pathlib import Path

app = typer.Typer()


@app.command()
def download_sluggerpics():
    """Download and unzip sluggerspics archive to data/sluggerpics"""
    url = "https://github.com/joeythegoon/sluggerspics/archive/refs/heads/main.zip"
    data_dir = Path("data")
    extract_dir = data_dir / "sluggerpics"
    zip_path = data_dir / "sluggerspics-main.zip"

    data_dir.mkdir(exist_ok=True)

    print(f"Downloading {url}...")
    with httpx.stream("GET", url, follow_redirects=True) as response:
        response.raise_for_status()
        with open(zip_path, "wb") as f:
            for chunk in response.iter_bytes():
                f.write(chunk)

    print(f"Extracting to {extract_dir}...")
    with zipfile.ZipFile(zip_path) as zip_file:
        zip_file.extractall(data_dir)

    extracted_dir = data_dir / "sluggerspics-main"
    if extracted_dir.exists():
        if extract_dir.exists():
            import shutil

            shutil.rmtree(extract_dir)
        extracted_dir.rename(extract_dir)

    zip_path.unlink()

    print(f"Successfully downloaded and extracted to {extract_dir}")


def copy_files(src_dir, dst_dir):
    """Recursively copy files from src_dir to dst_dir, preserving directory structure."""

    for item in src_dir.iterdir():
        dst_item = dst_dir / item.name
        if item.is_dir():
            dst_item.mkdir(parents=True, exist_ok=True)
            copy_files(item, dst_item)
        elif item.is_file():
            dst_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, dst_item)
    print(f"Copied files recursively from {src_dir} to {dst_dir}")


@app.command()
def copy_sluggerpics_assets():
    """
    Copy headshots/sideview images from data/sluggerpics to public/images/players,
    and logos to public/images/teams/logos.
    """
    src_base = Path("data/sluggerpics")
    src_headshots = src_base / "headshots"
    src_sideview = src_base / "sideview"
    src_logos = src_base / "logos"

    dst_base = Path("public/images")
    dst_headshots = dst_base / "players" / "headshots"
    dst_sideview = dst_base / "players" / "sideview"
    dst_logos = dst_base / "teams" / "logos"

    copy_files(src_headshots, dst_headshots)
    copy_files(src_sideview, dst_sideview)
    copy_files(src_logos, dst_logos)


if __name__ == "__main__":
    app()
