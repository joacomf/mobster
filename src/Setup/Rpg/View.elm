module Setup.Rpg.View exposing (RpgState(Checklist, NextUp), rpgView)

import Basics.Extra exposing ((=>))
import Html exposing (Html, button, div, input, label, li, span, text)
import Html.Attributes as Attr exposing (style, type_)
import Html.Events
import Html.Keyed
import List.Extra
import Roster.Data exposing (RosterData)
import Roster.Rpg as Rpg
import Roster.RpgPresenter
import Setup.Msg as Msg exposing (Msg)
import Setup.RpgIcons
import StylesheetHelper exposing (CssClasses(..), class)


type RpgState
    = Checklist
    | NextUp


rpgView : RpgState -> RosterData -> Html Msg
rpgView rpgState rosterData =
    let
        rpgButton =
            case rpgState of
                Checklist ->
                    button
                        [ Html.Events.onClick Msg.ViewRpgNextUp
                        , Attr.class "btn btn-info btn-lg btn-block"
                        , class [ BufferTop, TooltipContainer ]
                        , class [ LargeButtonText ]
                        ]
                        [ text "See Next Up" ]

                NextUp ->
                    button
                        [ Html.Events.onClick Msg.StartTimer
                        , Attr.class "btn btn-info btn-lg btn-block"
                        , class [ BufferTop, TooltipContainer ]
                        , class [ LargeButtonText ]
                        ]
                        [ text "Start Mobbing" ]
    in
    div [ Attr.class "container-fluid" ]
        [ rpgRolesView rosterData
        , div [ Attr.class "row", style [ "padding-bottom" => "1.333em" ] ]
            [ rpgButton ]
        , div [] [ allBadgesView rosterData ]
        ]


allBadgesView : Roster.Data.RosterData -> Html Msg
allBadgesView rosterData =
    div [] (List.map mobsterBadgesView rosterData.mobsters)


mobsterBadgesView : Roster.Data.Mobster -> Html Msg
mobsterBadgesView mobster =
    let
        badges =
            mobster.rpgData
                |> Rpg.badges
    in
    if List.length badges == 0 then
        span [] []
    else
        span []
            (span [] [ text mobster.name ]
                :: (badges |> List.map Setup.RpgIcons.mobsterIcon)
            )


rpgRolesView : RosterData -> Html Msg
rpgRolesView rosterData =
    let
        ( row1, row2 ) =
            List.Extra.splitAt 2 (rosterData |> Roster.RpgPresenter.present)
    in
    div [] [ rpgRolesRow row1, rpgRolesRow row2 ]


rpgRolesRow : List Roster.RpgPresenter.RpgMobster -> Html Msg
rpgRolesRow rpgMobsters =
    div [ Attr.class "row" ] (List.map rpgRoleView rpgMobsters)


rpgRoleView : Roster.RpgPresenter.RpgMobster -> Html Msg
rpgRoleView mobster =
    div [ Attr.class "col-md-6" ] [ rpgCardView mobster ]


rpgCardView : Roster.RpgPresenter.RpgMobster -> Html Msg
rpgCardView mobster =
    let
        roleName =
            toString mobster.role

        iconDiv =
            span [ class [ BufferRight ] ] [ Setup.RpgIcons.mobsterIcon mobster.role ]

        header =
            div [ Attr.class "h1" ] [ iconDiv, text (roleName ++ " ( " ++ mobster.name ++ ")") ]
    in
    div [] [ header, experienceView mobster ]


goalView : Roster.RpgPresenter.RpgMobster -> Int -> Rpg.Goal -> ( String, Html Msg )
goalView mobster goalIndex goal =
    let
        nameWithoutWhitespace =
            mobster.name |> String.words |> String.join ""

        uniqueId =
            nameWithoutWhitespace ++ toString mobster.role ++ toString goalIndex
    in
    ( uniqueId
    , li
        [ Attr.class "checkbox checkbox-success"
        , Html.Events.onClick (Msg.CheckRpgBox { index = mobster.index, role = mobster.role } goalIndex)
        ]
        [ input [ Attr.id uniqueId, type_ "checkbox", Attr.checked goal.complete ] []
        , label [ Attr.for uniqueId ] [ text goal.description ]
        ]
    )


experienceView : Roster.RpgPresenter.RpgMobster -> Html Msg
experienceView mobster =
    div [] [ Html.Keyed.ul [] (List.indexedMap (goalView mobster) mobster.experience) ]
