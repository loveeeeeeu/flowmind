interface RunVersionTagProps {
  version: { version: number } | null;
}

export function RunVersionTag({ version }: RunVersionTagProps) {
  if (!version) {
    return (
      <span className="run-version-tag legacy" title="版本化之前创建的运行，没有绑定发布版本">
        旧版运行
      </span>
    );
  }

  return (
    <span className="run-version-tag" title="这次运行执行的发布版本快照">
      v{version.version}
    </span>
  );
}
