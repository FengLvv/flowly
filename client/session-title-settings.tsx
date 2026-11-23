import { useSettings } from "@getpaseo/plugin/client";
import { sessionTitleSettings, sessionTitleValues } from "../shared/session-titles";
import { t } from "../shared/i18n";
import { useStored } from "./stored-settings";
import { SettingSwitch, SettingsGroup } from "./settings-ui";
import { Notice } from "./ui";

export function SessionTitleSettings() {
  const setting = useStored(useSettings(sessionTitleSettings), sessionTitleValues);
  return <SettingsGroup>
    {!!setting.problem && <Notice>{setting.problem}</Notice>}
    <SettingSwitch title={t("Auto conversation titles")}
      detail={t("For new conversations with a default title, send the first message (up to 1,000 characters) to your summary model provider. Uses the summary models and AI output language. Keeps manually named conversations and task titles.")}
      value={setting.values?.enabled ?? false} disabled={setting.busy}
      onChange={enabled => setting.save({ enabled })} />
  </SettingsGroup>;
}
